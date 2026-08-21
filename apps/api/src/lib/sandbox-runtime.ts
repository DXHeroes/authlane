import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { vercelAI } from '@authlane/ai/vercel';
import { createApiKey, getLookupKeyring } from '@authlane/crypto';
import {
  and,
  apiKeys,
  connections,
  type Database,
  desc,
  eq,
  like,
  sandboxRuns,
  sql,
  withTenantContext,
} from '@authlane/database';
import type { CapabilitiesResponse, MCPTool, Result, ToolRisk } from '@authlane/sdk';
import { Authlane } from '@authlane/sdk';
import { getToolRisk } from '@authlane/shared';
import {
  APICallError,
  generateText,
  type ModelMessage,
  stepCountIs,
  streamText,
  type TextStreamPart,
  type ToolExecutionOptions,
  type ToolSet,
} from 'ai';

type SandboxStatus = 'succeeded' | 'failed' | 'approval_required';
type SandboxProvider = 'openai' | 'anthropic' | 'google';

const SANDBOX_PROVIDERS: SandboxProvider[] = ['openai', 'anthropic', 'google'];

const PROVIDER_API_KEY_VARIABLE: Record<SandboxProvider, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
};

/** A single tool result can be megabytes. The model reads all of it; the browser only previews it. */
const MAX_TOOL_OUTPUT_CHARACTERS = 8_192;

export type SandboxAgentErrorCode =
  | 'SANDBOX_PROVIDER_NOT_CONFIGURED'
  | 'SANDBOX_MODEL_REJECTED'
  | 'SANDBOX_NO_TOOLS'
  | 'SANDBOX_AGENT_FAILED';

/**
 * Carries a cause the operator can act on. Collapsing every agent failure into one code is what
 * made a missing provider key, a retired model ID, and an identity with no connections all read
 * as the same "Agent run failed" in Sandbox.
 */
export class SandboxAgentError extends Error {
  constructor(
    readonly code: SandboxAgentErrorCode,
    readonly hint?: string
  ) {
    super(code);
    this.name = 'SandboxAgentError';
  }
}

const AGENT_ERROR_MESSAGES: Record<SandboxAgentErrorCode, string> = {
  SANDBOX_PROVIDER_NOT_CONFIGURED: 'The selected model provider is not configured on this server.',
  SANDBOX_MODEL_REJECTED: 'The model provider rejected this model ID.',
  SANDBOX_NO_TOOLS: 'This Sandbox identity has no connected tools.',
  SANDBOX_AGENT_FAILED: 'Sandbox agent execution failed.',
};

function agentErrorPayload(error: unknown) {
  const sandboxError = error instanceof SandboxAgentError ? error : null;
  const code = sandboxError?.code ?? 'SANDBOX_AGENT_FAILED';
  return {
    code,
    message: AGENT_ERROR_MESSAGES[code],
    ...(sandboxError?.hint ? { hint: sandboxError.hint } : {}),
  };
}

interface SandboxTool {
  execute?: (input: unknown, options: ToolExecutionOptions<Record<string, never>>) => unknown;
}

interface SandboxControlPlane {
  capabilities: {
    get(input: { externalUserId: string; format: 'mcp' }): Promise<Result<CapabilitiesResponse>>;
  };
  user(externalUserId: string): {
    tools: {
      list(input: {
        adapter: ReturnType<typeof vercelAI>;
      }): Promise<Result<Record<string, SandboxTool>>>;
    };
  };
}

interface SandboxAudit {
  organizationId: string;
  actorUserId: string;
  externalUserId: string;
  mode: 'tool' | 'agent';
  provider?: SandboxProvider;
  model?: string;
  serviceId?: string;
  toolName?: string;
  risk?: ToolRisk;
  status: SandboxStatus;
  durationMs: number;
  errorCode?: string;
}

interface AgentGenerationInput {
  provider: SandboxProvider;
  model: string;
  prompt?: string;
  messages?: ModelMessage[];
  tools: ToolSet;
}

interface AgentGenerationResult {
  text: string;
  finishReason: string;
  content: unknown[];
  responseMessages: unknown[];
  usage: unknown;
}

export interface SandboxIdentity {
  externalUserId: string;
  connectedServices: number;
  lastUsedAt: string | null;
}

export interface SandboxRuntimeDependencies {
  withControlPlane<T>(
    organizationId: string,
    run: (client: SandboxControlPlane) => Promise<T>
  ): Promise<T>;
  audit(input: SandboxAudit): Promise<void>;
  generateAgent(input: AgentGenerationInput): Promise<AgentGenerationResult>;
  streamAgent(
    input: AgentGenerationInput,
    onPart: (part: TextStreamPart<ToolSet>) => Promise<void>
  ): Promise<AgentGenerationResult>;
  listIdentities(organizationId: string): Promise<SandboxIdentity[]>;
  configuredProviders(): SandboxProvider[];
  now?: () => number;
}

export interface SandboxToolRunInput {
  organizationId: string;
  actorUserId: string;
  externalUserId: string;
  serviceId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  approved: boolean;
}

export interface SandboxAgentRunInput {
  organizationId: string;
  actorUserId: string;
  externalUserId: string;
  provider: SandboxProvider;
  model: string;
  prompt?: string;
  messages?: ModelMessage[];
}

export type SandboxStreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | {
      type: 'tool-result';
      toolCallId: string;
      toolName: string;
      output: unknown;
      truncated: boolean;
    }
  | { type: 'tool-error'; toolCallId: string; toolName: string }
  | { type: 'tool-denied'; toolCallId: string; toolName: string }
  | { type: 'approval-request'; approvalId: string; toolCall: { toolName: string; input: unknown } }
  | { type: 'done'; result: Record<string, unknown> }
  | { type: 'error'; error: { code: string; message: string; hint?: string } };

/** Generates a dedicated Sandbox identity so nobody has to invent one by hand. */
export function generateSandboxExternalUserId(): string {
  return `sandbox_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

function previewToolOutput(value: unknown): { output: unknown; truncated: boolean } {
  let serialized: string;
  try {
    serialized = JSON.stringify(value) ?? 'null';
  } catch {
    return { output: '[unserializable tool output]', truncated: true };
  }
  if (serialized.length <= MAX_TOOL_OUTPUT_CHARACTERS) return { output: value, truncated: false };
  return { output: `${serialized.slice(0, MAX_TOOL_OUTPUT_CHARACTERS)}…`, truncated: true };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function approvalRequestsFrom(content: unknown[]): Record<string, unknown>[] {
  return content.filter(
    (part): part is Record<string, unknown> =>
      isRecord(part) && part.type === 'tool-approval-request'
  );
}

/**
 * Maps one AI SDK stream part onto the narrow event set Sandbox sends to the browser. Anything not
 * named here — raw provider chunks, reasoning, partial tool input — is deliberately dropped.
 */
export function toSandboxStreamEvent(part: TextStreamPart<ToolSet>): SandboxStreamEvent | null {
  if (part.type === 'text-delta') {
    return part.text ? { type: 'text-delta', text: part.text } : null;
  }
  if (part.type === 'tool-call') {
    return {
      type: 'tool-call',
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      input: part.input,
    };
  }
  if (part.type === 'tool-result') {
    const { output, truncated } = previewToolOutput(part.output);
    return {
      type: 'tool-result',
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      output,
      truncated,
    };
  }
  if (part.type === 'tool-error') {
    return { type: 'tool-error', toolCallId: part.toolCallId, toolName: part.toolName };
  }
  if (part.type === 'tool-output-denied') {
    return { type: 'tool-denied', toolCallId: part.toolCallId, toolName: part.toolName };
  }
  if (part.type === 'tool-approval-request') {
    return {
      type: 'approval-request',
      approvalId: part.approvalId,
      toolCall: { toolName: part.toolCall.toolName, input: part.toolCall.input },
    };
  }
  return null;
}

function findTool(
  capabilities: CapabilitiesResponse,
  serviceId: string,
  toolName: string
): { definition: MCPTool; risk: ToolRisk } | null {
  const service = capabilities.services.find(
    (candidate) => candidate.serviceId === serviceId && candidate.connected
  );
  const definition = service?.tools.find(
    (tool): tool is MCPTool => 'inputSchema' in tool && tool.name === toolName
  );
  return definition ? { definition, risk: getToolRisk(definition.annotations) } : null;
}

async function capabilitiesFor(client: SandboxControlPlane, externalUserId: string) {
  const result = await client.capabilities.get({ externalUserId, format: 'mcp' });
  if (result.error) throw new Error(result.error.code);
  return result.data;
}

async function toolsFor(
  client: SandboxControlPlane,
  externalUserId: string
): Promise<Record<string, SandboxTool>> {
  const built = await client.user(externalUserId).tools.list({
    adapter: vercelAI({ approval: 'write-and-destructive' }),
  });
  if (built.error) throw new Error(built.error.code);
  return built.data;
}

export function createSandboxRuntime(dependencies: SandboxRuntimeDependencies) {
  const now = dependencies.now ?? (() => performance.now());

  return {
    /**
     * Sandbox identities the organization already has, newest activity first, plus the one the
     * dashboard should preselect. A freshly generated ID has nothing connected, so an identity
     * that can actually do something always wins over a newer empty one.
     */
    async listIdentities(organizationId: string) {
      const identities = await dependencies.listIdentities(organizationId);
      const suggested =
        identities.find((identity) => identity.connectedServices > 0)?.externalUserId ??
        identities[0]?.externalUserId ??
        generateSandboxExternalUserId();
      return { identities, suggested };
    },

    async getContext(organizationId: string, externalUserId: string) {
      const configured = new Set(dependencies.configuredProviders());
      return dependencies.withControlPlane(organizationId, async (client) => {
        const capabilities = await capabilitiesFor(client, externalUserId);
        return {
          ...capabilities,
          providers: SANDBOX_PROVIDERS.map((id) => ({ id, configured: configured.has(id) })),
          services: capabilities.services.map((service) => ({
            ...service,
            tools: service.tools.map((tool) => ({
              ...tool,
              risk: 'annotations' in tool ? getToolRisk(tool.annotations) : 'write',
            })),
          })),
        };
      });
    },

    async runTool(input: SandboxToolRunInput) {
      const startedAt = now();
      let risk: ToolRisk | undefined;
      let response: Record<string, unknown>;
      try {
        response = await dependencies.withControlPlane(input.organizationId, async (client) => {
          const capabilities = await capabilitiesFor(client, input.externalUserId);
          const tool = findTool(capabilities, input.serviceId, input.toolName);
          if (!tool) throw new Error('TOOL_NOT_AVAILABLE');
          risk = tool.risk;
          if (risk !== 'read' && !input.approved) {
            return {
              status: 'approval_required',
              risk,
              serviceId: input.serviceId,
              toolName: input.toolName,
              arguments: input.arguments,
            };
          }

          const built = await toolsFor(client, input.externalUserId);
          const executable = built[input.toolName]?.execute;
          if (typeof executable !== 'function') throw new Error('TOOL_NOT_AVAILABLE');
          const result = await executable(input.arguments, {
            toolCallId: crypto.randomUUID(),
            messages: [],
            context: {},
          });
          return { status: 'succeeded', risk, result };
        });
      } catch (error) {
        const code =
          error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
            ? error.message
            : 'SANDBOX_TOOL_FAILED';
        response = { status: 'failed', error: { code, message: 'Sandbox tool execution failed.' } };
      }

      await dependencies.audit({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        externalUserId: input.externalUserId,
        mode: 'tool',
        serviceId: input.serviceId,
        toolName: input.toolName,
        risk,
        status: response.status as SandboxStatus,
        durationMs: Math.max(0, Math.round(now() - startedAt)),
        ...(response.status === 'failed' ? { errorCode: 'SANDBOX_TOOL_FAILED' } : {}),
      });
      return response;
    },

    async runAgent(input: SandboxAgentRunInput) {
      const startedAt = now();
      let response: Record<string, unknown>;
      try {
        response = await dependencies.withControlPlane(input.organizationId, async (client) => {
          const tools = await toolsFor(client, input.externalUserId);
          if (Object.keys(tools).length === 0) {
            throw new SandboxAgentError(
              'SANDBOX_NO_TOOLS',
              'Connect a service for this Sandbox identity before running the agent.'
            );
          }
          const generated = await dependencies.generateAgent({
            provider: input.provider,
            model: input.model,
            prompt: input.prompt,
            messages: input.messages,
            tools: tools as ToolSet,
          });
          const approvalRequests = approvalRequestsFrom(generated.content);
          return {
            status: approvalRequests.length > 0 ? 'approval_required' : 'succeeded',
            text: generated.text,
            finishReason: generated.finishReason,
            approvalRequests,
            responseMessages: generated.responseMessages,
            usage: generated.usage,
          };
        });
      } catch (error) {
        response = { status: 'failed', error: agentErrorPayload(error) };
      }
      await dependencies.audit({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        externalUserId: input.externalUserId,
        mode: 'agent',
        provider: input.provider,
        model: input.model,
        status: response.status as SandboxStatus,
        durationMs: Math.max(0, Math.round(now() - startedAt)),
        ...(response.status === 'failed'
          ? { errorCode: (response.error as { code: string }).code }
          : {}),
      });
      return response;
    },

    /**
     * Same contract as `runAgent`, but every step is emitted while it happens and the final `done`
     * event carries the exact payload the non-streaming endpoint returns, so the browser thread
     * state and the approval round-trip stay identical either way.
     */
    async streamAgent(
      input: SandboxAgentRunInput,
      emit: (event: SandboxStreamEvent) => Promise<void> | void
    ) {
      const startedAt = now();
      let status: SandboxStatus = 'failed';
      let errorCode: string | undefined;
      try {
        await dependencies.withControlPlane(input.organizationId, async (client) => {
          const tools = await toolsFor(client, input.externalUserId);
          if (Object.keys(tools).length === 0) {
            throw new SandboxAgentError(
              'SANDBOX_NO_TOOLS',
              'Connect a service for this Sandbox identity before running the agent.'
            );
          }

          const generated = await dependencies.streamAgent(
            {
              provider: input.provider,
              model: input.model,
              prompt: input.prompt,
              messages: input.messages,
              tools: tools as ToolSet,
            },
            async (part) => {
              const event = toSandboxStreamEvent(part);
              if (event) await emit(event);
            }
          );

          const approvalRequests = approvalRequestsFrom(generated.content);
          status = approvalRequests.length > 0 ? 'approval_required' : 'succeeded';
          await emit({
            type: 'done',
            result: {
              status,
              text: generated.text,
              finishReason: generated.finishReason,
              approvalRequests,
              responseMessages: generated.responseMessages,
              usage: generated.usage,
            },
          });
        });
      } catch (error) {
        status = 'failed';
        const payload = agentErrorPayload(error);
        errorCode = payload.code;
        await emit({ type: 'error', error: payload });
      }

      await dependencies.audit({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        externalUserId: input.externalUserId,
        mode: 'agent',
        provider: input.provider,
        model: input.model,
        status,
        durationMs: Math.max(0, Math.round(now() - startedAt)),
        ...(errorCode ? { errorCode } : {}),
      });
    },
  };
}

function requiredApiKey(provider: SandboxProvider): string {
  const variable = PROVIDER_API_KEY_VARIABLE[provider];
  const value = process.env[variable];
  if (!value) {
    throw new SandboxAgentError(
      'SANDBOX_PROVIDER_NOT_CONFIGURED',
      `Set ${variable} on the Authlane server, or pick a provider that is already configured.`
    );
  }
  return value;
}

function languageModel(provider: SandboxProvider, model: string) {
  if (provider === 'openai') return createOpenAI({ apiKey: requiredApiKey(provider) })(model);
  if (provider === 'anthropic') {
    return createAnthropic({ apiKey: requiredApiKey(provider) })(model);
  }
  return createGoogleGenerativeAI({ apiKey: requiredApiKey(provider) })(model);
}

/**
 * A provider that rejects the request outright — almost always a model ID it does not serve — is
 * worth naming, because the model field is free text precisely so an operator can correct it.
 */
function classifyModelError(error: unknown): unknown {
  if (error instanceof SandboxAgentError) return error;
  if (
    APICallError.isInstance(error) &&
    typeof error.statusCode === 'number' &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  ) {
    return new SandboxAgentError(
      'SANDBOX_MODEL_REJECTED',
      'Check the model ID — availability differs by account and region.'
    );
  }
  return error;
}

const SANDBOX_SYSTEM_PROMPT =
  'You are testing the connected tools for one dedicated Authlane sandbox identity. Use tools only when needed. Never invent provider data.';

function promptOrMessages(input: AgentGenerationInput) {
  return input.messages ? { messages: input.messages } : { prompt: input.prompt ?? '' };
}

export function createDatabaseSandboxRuntime(
  db: Database,
  internalFetch: typeof fetch,
  internalBaseUrl = 'https://app.authlane.io'
) {
  return createSandboxRuntime({
    async withControlPlane<T>(
      organizationId: string,
      run: (client: SandboxControlPlane) => Promise<T>
    ) {
      const id = `sandbox_${crypto.randomUUID().replaceAll('-', '')}`;
      const issued = createApiKey(id, getLookupKeyring());
      // Each database touch gets its own short transaction. A streaming run outlives the request
      // that started it, and one long transaction spanning the whole run would both pin a pooled
      // connection and, once any statement inside it failed, swallow every later write — the audit
      // row included.
      await withTenantContext(db, organizationId, async () => {
        await db.insert(apiKeys).values({
          id,
          organizationId,
          name: 'Ephemeral product sandbox',
          keyHash: issued.keyHash,
          keyHint: issued.keyHint,
          scopes: ['catalog:read', 'connections:read', 'credentials:issue'],
          expiresAt: new Date(Date.now() + 120_000),
        });
      });
      try {
        const client = new Authlane({
          apiKey: issued.rawKey,
          baseUrl: internalBaseUrl,
          fetch: internalFetch,
          timeout: 45_000,
        });
        return await run(client as unknown as SandboxControlPlane);
      } finally {
        // Disabled, not deleted. Issuing a credential lease writes an append-only access-audit row
        // that points at this key, and dropping the key would rewrite that row — which the database
        // refuses, taking the whole run down with it. Disabling revokes the key just as hard.
        await withTenantContext(db, organizationId, async () => {
          await db.update(apiKeys).set({ enabled: false }).where(eq(apiKeys.id, id));
        });
      }
    },
    async audit(input) {
      await withTenantContext(db, input.organizationId, async () => {
        await db.insert(sandboxRuns).values({
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          externalUserId: input.externalUserId,
          mode: input.mode,
          provider: input.provider,
          model: input.model,
          serviceId: input.serviceId,
          toolName: input.toolName,
          risk: input.risk,
          status: input.status,
          durationMs: input.durationMs,
          errorCode: input.errorCode,
        });
      });
    },
    configuredProviders() {
      return SANDBOX_PROVIDERS.filter(
        (provider) => !!process.env[PROVIDER_API_KEY_VARIABLE[provider]]
      );
    },
    async listIdentities(organizationId) {
      // `_` is a LIKE wildcard, so the prefix has to be escaped or `sandboxXuser` would match too.
      const sandboxPrefix = 'sandbox\\_%';
      const [connected, used] = await Promise.all([
        db
          .select({
            externalUserId: connections.externalUserId,
            connectedServices: sql<number>`count(*) filter (where ${connections.status} = 'connected')`,
            lastUsedAt: sql<Date | null>`max(${connections.connectedAt})`,
          })
          .from(connections)
          .where(
            and(
              eq(connections.organizationId, organizationId),
              like(connections.externalUserId, sandboxPrefix)
            )
          )
          .groupBy(connections.externalUserId),
        db
          .select({
            externalUserId: sandboxRuns.externalUserId,
            lastUsedAt: sql<Date | null>`max(${sandboxRuns.createdAt})`,
          })
          .from(sandboxRuns)
          .where(
            and(
              eq(sandboxRuns.organizationId, organizationId),
              like(sandboxRuns.externalUserId, sandboxPrefix)
            )
          )
          .groupBy(sandboxRuns.externalUserId)
          .orderBy(desc(sql`max(${sandboxRuns.createdAt})`))
          .limit(50),
      ]);

      const merged = new Map<string, SandboxIdentity>();
      for (const row of connected) {
        merged.set(row.externalUserId, {
          externalUserId: row.externalUserId,
          connectedServices: Number(row.connectedServices ?? 0),
          lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt).toISOString() : null,
        });
      }
      for (const row of used) {
        const existing = merged.get(row.externalUserId);
        const lastUsedAt = row.lastUsedAt ? new Date(row.lastUsedAt).toISOString() : null;
        if (!existing) {
          merged.set(row.externalUserId, {
            externalUserId: row.externalUserId,
            connectedServices: 0,
            lastUsedAt,
          });
          continue;
        }
        if (lastUsedAt && (!existing.lastUsedAt || lastUsedAt > existing.lastUsedAt)) {
          existing.lastUsedAt = lastUsedAt;
        }
      }

      return [...merged.values()]
        .sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? ''))
        .slice(0, 20);
    },
    async generateAgent(input) {
      try {
        const result = await generateText({
          model: languageModel(input.provider, input.model),
          system: SANDBOX_SYSTEM_PROMPT,
          ...promptOrMessages(input),
          tools: input.tools,
          stopWhen: stepCountIs(6),
        });
        return {
          text: result.text,
          finishReason: result.finishReason,
          content: result.content,
          responseMessages: result.responseMessages,
          usage: result.usage,
        };
      } catch (error) {
        throw classifyModelError(error);
      }
    },
    async streamAgent(input, onPart) {
      try {
        const result = streamText({
          model: languageModel(input.provider, input.model),
          system: SANDBOX_SYSTEM_PROMPT,
          ...promptOrMessages(input),
          tools: input.tools,
          stopWhen: stepCountIs(6),
        });

        const content: unknown[] = [];
        let text = '';
        for await (const part of result.stream) {
          if (part.type === 'text-delta') text += part.text;
          if (part.type === 'tool-approval-request') content.push(part);
          if (part.type === 'error') throw part.error;
          await onPart(part);
        }

        const [responseMessages, finishReason, usage] = await Promise.all([
          result.responseMessages,
          result.finishReason,
          result.totalUsage,
        ]);
        return { text, finishReason, content, responseMessages, usage };
      } catch (error) {
        throw classifyModelError(error);
      }
    },
  });
}
