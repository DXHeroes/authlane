import { and, type Database, eq, member, withoutDatabaseContext } from '@authlane/database';
import { Errors, isConnectableServiceId, isValidServiceId, isValidUserId } from '@authlane/shared';
import { type Context, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { errorResult } from '../lib/api-response.js';
import { parseSandboxMessages } from '../lib/sandbox-messages.js';
import type { createSandboxRuntime, SandboxAgentRunInput } from '../lib/sandbox-runtime.js';

type SandboxRuntime = ReturnType<typeof createSandboxRuntime>;

const HISTORY_ERROR_HINTS: Record<string, string> = {
  SANDBOX_HISTORY_TOO_LARGE:
    'This thread grew past what Sandbox forwards to a model. Start a new chat.',
  SANDBOX_HISTORY_INVALID: 'Start a new chat to reset the conversation history.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSandboxExternalUserId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('sandbox_') && isValidUserId(value);
}

async function requireSandboxAdmin(c: Context, db: Database) {
  const organization = c.get('organization');
  const user = c.get('user');
  if (!organization || !user) {
    return { error: c.json(errorResult(Errors.unauthorized('Authentication required')), 401) };
  }
  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organization.id), eq(member.userId, user.id)))
    .limit(1);
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return {
      error: c.json(
        errorResult(
          Errors.insufficientScope('Only organization owners and admins can use Sandbox')
        ),
        403
      ),
    };
  }
  return { organizationId: organization.id, actorUserId: user.id };
}

type AgentRunAccess = { organizationId: string; actorUserId: string };

/**
 * Shared by the JSON and the streaming endpoint. Once SSE starts flowing the status code is
 * already committed, so every rejection has to happen here, before a stream is opened.
 */
function parseAgentRunBody(
  body: unknown,
  access: AgentRunAccess
): { input: SandboxAgentRunInput } | { code: string; message: string; hint?: string } {
  if (!isRecord(body)) {
    return { code: 'VALIDATION_ERROR', message: 'Invalid sandbox agent request' };
  }
  const { externalUserId, provider, model, prompt, messages } = body;
  const validPrompt =
    typeof prompt === 'string' && prompt.trim().length > 0 && prompt.length <= 20_000;
  const parsed = messages === undefined ? undefined : parseSandboxMessages(messages);

  if (parsed && !parsed.ok) {
    return {
      code: parsed.code,
      message: 'Invalid sandbox conversation history',
      hint: HISTORY_ERROR_HINTS[parsed.code],
    };
  }
  if (
    !isSandboxExternalUserId(externalUserId) ||
    !['openai', 'anthropic', 'google'].includes(String(provider)) ||
    typeof model !== 'string' ||
    !/^[A-Za-z0-9._:/-]{1,128}$/.test(model) ||
    (!validPrompt && !parsed) ||
    (prompt !== undefined && typeof prompt !== 'string')
  ) {
    return { code: 'VALIDATION_ERROR', message: 'Invalid sandbox agent request' };
  }

  return {
    input: {
      ...access,
      externalUserId,
      provider: provider as 'openai' | 'anthropic' | 'google',
      model,
      ...(validPrompt ? { prompt } : {}),
      ...(parsed?.ok ? { messages: parsed.messages } : {}),
    },
  };
}

export function createSandboxRouter(db: Database, runtime: SandboxRuntime) {
  const router = new Hono();

  router.use('*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store, private');
    c.header('Pragma', 'no-cache');
    c.header('Referrer-Policy', 'no-referrer');
  });

  router.get('/sandbox/identities', async (c) => {
    const access = await requireSandboxAdmin(c, db);
    if ('error' in access) return access.error;
    try {
      const data = await runtime.listIdentities(access.organizationId);
      return c.json({ data, error: null });
    } catch {
      return c.json(errorResult(Errors.internalError('Failed to list sandbox identities')), 500);
    }
  });

  router.get('/sandbox', async (c) => {
    const access = await requireSandboxAdmin(c, db);
    if ('error' in access) return access.error;
    const externalUserId = c.req.query('externalUserId') ?? '';
    if (!isSandboxExternalUserId(externalUserId)) {
      return c.json(
        errorResult(Errors.validationError('Sandbox external user ID must start with sandbox_')),
        400
      );
    }
    try {
      const data = await runtime.getContext(access.organizationId, externalUserId);
      return c.json({ data, error: null });
    } catch {
      return c.json(errorResult(Errors.internalError('Failed to load sandbox context')), 500);
    }
  });

  router.post('/sandbox/tool-runs', async (c) => {
    const access = await requireSandboxAdmin(c, db);
    if ('error' in access) return access.error;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorResult(Errors.validationError('Invalid JSON body')), 400);
    }
    if (!isRecord(body)) {
      return c.json(errorResult(Errors.validationError('Invalid sandbox tool request')), 400);
    }
    const externalUserId = body.externalUserId;
    const serviceId = body.serviceId;
    const toolName = body.toolName;
    if (
      !isSandboxExternalUserId(externalUserId) ||
      typeof serviceId !== 'string' ||
      !isValidServiceId(serviceId) ||
      // A tenant MCP server is a connectable service id too, and Sandbox lists its tools.
      !isConnectableServiceId(serviceId) ||
      typeof toolName !== 'string' ||
      toolName.length < 1 ||
      toolName.length > 160 ||
      !isRecord(body.arguments) ||
      (body.approved !== undefined && typeof body.approved !== 'boolean')
    ) {
      return c.json(errorResult(Errors.validationError('Invalid sandbox tool request')), 400);
    }
    const data = await runtime.runTool({
      ...access,
      externalUserId,
      serviceId,
      toolName,
      arguments: body.arguments,
      approved: body.approved === true,
    });
    return c.json({ data, error: null });
  });

  router.post('/sandbox/agent-runs', async (c) => {
    const access = await requireSandboxAdmin(c, db);
    if ('error' in access) return access.error;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorResult(Errors.validationError('Invalid JSON body')), 400);
    }
    const parsed = parseAgentRunBody(body, access);
    if (!('input' in parsed)) {
      return c.json(errorResult(Errors.validationError(parsed.message, parsed.hint)), 400);
    }
    const data = await runtime.runAgent(parsed.input);
    return c.json({ data, error: null });
  });

  router.post('/sandbox/agent-runs/stream', async (c) => {
    const access = await requireSandboxAdmin(c, db);
    if ('error' in access) return access.error;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorResult(Errors.validationError('Invalid JSON body')), 400);
    }
    const parsed = parseAgentRunBody(body, access);
    if (!('input' in parsed)) {
      return c.json(errorResult(Errors.validationError(parsed.message, parsed.hint)), 400);
    }

    // Reverse proxies buffer text/event-stream by default, which turns a live thread back into
    // one long pause followed by the whole answer at once.
    c.header('X-Accel-Buffering', 'no');
    return streamSSE(c, async (stream) => {
      // The stream body outlives this handler, and with it the request's tenant transaction. Left
      // inside it, every query the run makes would wait on a connection that was already released.
      await withoutDatabaseContext(() =>
        runtime.streamAgent(parsed.input, async (event) => {
          await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
        })
      );
    });
  });

  return router;
}
