import { and, type Database, eq, member } from '@authlane/database';
import { Errors, isSupportedServiceId, isValidServiceId, isValidUserId } from '@authlane/shared';
import { type Context, Hono } from 'hono';
import { errorResult } from '../lib/api-response.js';
import { parseSandboxMessages } from '../lib/sandbox-messages.js';
import type { createSandboxRuntime } from '../lib/sandbox-runtime.js';

type SandboxRuntime = ReturnType<typeof createSandboxRuntime>;

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

export function createSandboxRouter(db: Database, runtime: SandboxRuntime) {
  const router = new Hono();

  router.use('*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store, private');
    c.header('Pragma', 'no-cache');
    c.header('Referrer-Policy', 'no-referrer');
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
      !isSupportedServiceId(serviceId) ||
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
    if (!isRecord(body)) {
      return c.json(errorResult(Errors.validationError('Invalid sandbox agent request')), 400);
    }
    const externalUserId = body.externalUserId;
    const provider = body.provider;
    const model = body.model;
    const prompt = body.prompt;
    const messages = body.messages;
    const validPrompt =
      typeof prompt === 'string' && prompt.trim().length > 0 && prompt.length <= 20_000;
    const parsedMessages = messages === undefined ? undefined : parseSandboxMessages(messages);
    if (
      !isSandboxExternalUserId(externalUserId) ||
      !['openai', 'anthropic', 'google'].includes(String(provider)) ||
      typeof model !== 'string' ||
      !/^[A-Za-z0-9._:/-]{1,128}$/.test(model) ||
      (!validPrompt && !parsedMessages) ||
      (prompt !== undefined && typeof prompt !== 'string') ||
      (messages !== undefined && !parsedMessages)
    ) {
      return c.json(errorResult(Errors.validationError('Invalid sandbox agent request')), 400);
    }
    const data = await runtime.runAgent({
      ...access,
      externalUserId,
      provider: provider as 'openai' | 'anthropic' | 'google',
      model,
      ...(validPrompt ? { prompt } : {}),
      ...(parsedMessages ? { messages: parsedMessages } : {}),
    });
    return c.json({ data, error: null });
  });

  return router;
}
