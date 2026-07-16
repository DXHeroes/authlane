/** Authentication for dashboard sessions and scoped SaaS API keys. */

import type { Database, Organization } from '@authlane/database';
import { apiKeys, eq, organization } from '@authlane/database';
import { Errors, hashApiKey } from '@authlane/shared';
import type { Context, Next } from 'hono';
import { type ApiPrincipal, normalizeApiScopes } from '../lib/api-principal.js';
import type { Auth } from '../lib/auth.js';

interface AuthMiddlewareOptions {
  now?: () => Date;
}

function extractApiKey(c: Context): string | null {
  const authorization = c.req.header('Authorization');
  if (!authorization) return null;

  const match = authorization.match(/^(?:Bearer|ApiKey)\s+(.+)$/i);
  return match?.[1]?.startsWith('ak_') ? match[1] : null;
}

async function findApiKeyPrincipal(
  db: Database,
  keyHash: string,
  now: Date
): Promise<ApiPrincipal | null> {
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);

  if (!key?.enabled || (key.expiresAt && key.expiresAt <= now)) {
    return null;
  }

  return {
    kind: 'api_key',
    organizationId: key.organizationId,
    apiKeyId: key.id,
    scopes: normalizeApiScopes(key.scopes),
  };
}

export function authMiddleware(db: Database, auth?: Auth, options: AuthMiddlewareOptions = {}) {
  const now = options.now ?? (() => new Date());

  return async (c: Context, next: Next) => {
    const path = c.req.path;
    if (
      path.startsWith('/api/v1/oauth/') ||
      (path.startsWith('/api/v1/connect/') && path !== '/api/v1/connect-sessions')
    ) {
      await next();
      return;
    }

    const session = auth ? await auth.api.getSession({ headers: c.req.raw.headers }) : null;

    if (session?.session.activeOrganizationId) {
      const organizationId = session.session.activeOrganizationId;
      const [activeOrganization] = await db
        .select()
        .from(organization)
        .where(eq(organization.id, organizationId))
        .limit(1);

      if (!activeOrganization) {
        return c.json(Errors.unauthorized('The active organization no longer exists'), 401);
      }

      c.set('user', { ...session.user, image: session.user.image ?? null });
      c.set('session', session.session);
      c.set('organization', activeOrganization);
      c.set('apiKey', null);
      c.set('principal', {
        kind: 'session',
        organizationId,
        apiKeyId: null,
        scopes: [],
      });
      await next();
      return;
    }

    const rawApiKey = extractApiKey(c);
    if (!rawApiKey) {
      return c.json(Errors.unauthorized('A scoped Authlane API key is required'), 401);
    }

    const keyHash = hashApiKey(rawApiKey);
    const principal = await findApiKeyPrincipal(db, keyHash, now());

    if (!principal) {
      return c.json(Errors.unauthorized('Invalid, disabled, or expired API key'), 401);
    }

    c.set('user', null);
    c.set('session', null);
    c.set('organization', { id: principal.organizationId } as Organization);
    c.set('apiKey', rawApiKey);
    c.set('principal', principal);
    await next();
  };
}
