import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { vercelAI } from '@authlane/ai/vercel';
import { createApiKey, getLookupKeyring } from '@authlane/crypto';
import { apiKeys, type Database, eq, sandboxRuns } from '@authlane/database';
import type { CapabilitiesResponse, MCPTool, Result, ToolRisk } from '@authlane/sdk';
import { Authlane } from '@authlane/sdk';
import { getToolRisk } from '@authlane/shared';
import {
  generateText,
  type ModelMessage,
  stepCountIs,
  type ToolExecutionOptions,
  type ToolSet,
} from 'ai';

type SandboxStatus = 'succeeded' | 'failed' | 'approval_required';
type SandboxProvider = 'openai' | 'anthropic' | 'google';

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

export interface SandboxRuntimeDependencies {
  withControlPlane<T>(
    organizationId: string,
    run: (client: SandboxControlPlane) => Promise<T>
  ): Promise<T>;
  audit(input: SandboxAudit): Promise<void>;
  generateAgent(input: AgentGenerationInput): Promise<AgentGenerationResult>;
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

export function createSandboxRuntime(dependencies: SandboxRuntimeDependencies) {
  const now = dependencies.now ?? (() => performance.now());

  return {
    async getContext(organizationId: string, externalUserId: string) {
      return dependencies.withControlPlane(organizationId, async (client) => {
        const capabilities = await capabilitiesFor(client, externalUserId);
        return {
          ...capabilities,
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

          const built = await client.user(input.externalUserId).tools.list({
            adapter: vercelAI({ approval: 'write-and-destructive' }),
          });
          if (built.error) throw new Error(built.error.code);
          const executable = built.data[input.toolName]?.execute;
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
          const built = await client.user(input.externalUserId).tools.list({
            adapter: vercelAI({ approval: 'write-and-destructive' }),
          });
          if (built.error) throw new Error(built.error.code);
          const generated = await dependencies.generateAgent({
            provider: input.provider,
            model: input.model,
            prompt: input.prompt,
            messages: input.messages,
            tools: built.data as ToolSet,
          });
          const approvalRequests = generated.content.filter(
            (part): part is Record<string, unknown> =>
              typeof part === 'object' &&
              part !== null &&
              'type' in part &&
              part.type === 'tool-approval-request'
          );
          return {
            status: approvalRequests.length > 0 ? 'approval_required' : 'succeeded',
            text: generated.text,
            finishReason: generated.finishReason,
            approvalRequests,
            responseMessages: generated.responseMessages,
            usage: generated.usage,
          };
        });
      } catch {
        response = {
          status: 'failed',
          error: { code: 'SANDBOX_AGENT_FAILED', message: 'Sandbox agent execution failed.' },
        };
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
        ...(response.status === 'failed' ? { errorCode: 'SANDBOX_AGENT_FAILED' } : {}),
      });
      return response;
    },
  };
}

function requiredApiKey(provider: SandboxProvider): string {
  const variable = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  }[provider];
  const value = process.env[variable];
  if (!value) throw new Error(`Missing ${variable}`);
  return value;
}

function languageModel(provider: SandboxProvider, model: string) {
  if (provider === 'openai') return createOpenAI({ apiKey: requiredApiKey(provider) })(model);
  if (provider === 'anthropic') {
    return createAnthropic({ apiKey: requiredApiKey(provider) })(model);
  }
  return createGoogleGenerativeAI({ apiKey: requiredApiKey(provider) })(model);
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
      await db.insert(apiKeys).values({
        id,
        organizationId,
        name: 'Ephemeral product sandbox',
        keyHash: issued.keyHash,
        keyHint: issued.keyHint,
        scopes: ['catalog:read', 'connections:read', 'credentials:issue'],
        expiresAt: new Date(Date.now() + 120_000),
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
        await db.delete(apiKeys).where(eq(apiKeys.id, id));
      }
    },
    async audit(input) {
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
    },
    async generateAgent(input) {
      const result = await generateText({
        model: languageModel(input.provider, input.model),
        system:
          'You are testing the connected tools for one dedicated Authlane sandbox identity. Use tools only when needed. Never invent provider data.',
        ...(input.messages ? { messages: input.messages } : { prompt: input.prompt ?? '' }),
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
    },
  });
}
