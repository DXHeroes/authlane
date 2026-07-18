/** Authentication for dashboard sessions and scoped SaaS API keys. */

import { apiKeyRecordId, getLookupKeyring, type Keyring, verifyApiKey } from '@authlane/crypto';
import type { Database, Organization } from '@authlane/database';
import {
  apiKeys,
  eq,
  organization,
  withSecurityLookupContext,
  withTenantContext,
} from '@authlane/database';
import { Errors } from '@authlane/shared';
import type { Context, Next } from 'hono';
import { type ApiPrincipal, normalizeApiScopes } from '../lib/api-principal.js';
import { errorResult } from '../lib/api-response.js';
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
  rawApiKey: string,
  keyring: Keyring,
  now: Date
): Promise<ApiPrincipal | null> {
  const recordId = apiKeyRecordId(rawApiKey);
  if (!recordId) return null;
  const [key] = await withSecurityLookupContext(db, 'authlane.api_key_id', recordId, () =>
    db.select().from(apiKeys).where(eq(apiKeys.id, recordId)).limit(1)
  );

  if (
    !key?.enabled ||
    (key.expiresAt && key.expiresAt <= now) ||
    !verifyApiKey(rawApiKey, key.id, key.keyHash, keyring)
  ) {
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
  const lookupKeyring = getLookupKeyring();

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
        return c.json(
          errorResult(Errors.unauthorized('The active organization no longer exists')),
          401
        );
      }

      c.set('user', {
        ...session.user,
        image: session.user.image ?? null,
        twoFactorEnabled: Boolean(
          (session.user as typeof session.user & { twoFactorEnabled?: boolean }).twoFactorEnabled
        ),
      });
      c.set('session', session.session);
      c.set('organization', activeOrganization);
      c.set('apiKey', null);
      c.set('principal', {
        kind: 'session',
        organizationId,
        apiKeyId: null,
        scopes: [],
      });
      await withTenantContext(db, organizationId, next);
      return;
    }

    const rawApiKey = extractApiKey(c);
    if (!rawApiKey) {
      return c.json(errorResult(Errors.unauthorized('A scoped Authlane API key is required')), 401);
    }

    const principal = await findApiKeyPrincipal(db, rawApiKey, lookupKeyring, now());

    if (!principal) {
      return c.json(errorResult(Errors.unauthorized('Invalid, disabled, or expired API key')), 401);
    }

    c.set('user', null);
    c.set('session', null);
    c.set('organization', { id: principal.organizationId } as Organization);
    c.set('apiKey', rawApiKey);
    c.set('principal', principal);
    await withTenantContext(db, principal.organizationId, next);
  };
}
