/**
 * Authentication middleware
 * Supports better-auth sessions (dashboard) and API keys (external SDK)
 */

import type { Database } from '@authlane/database';
import { organization, organizationServices, eq } from '@authlane/database';
import { Errors, hashApiKey } from '@authlane/shared';
import type { Context, Next } from 'hono';
import type { Auth } from '../lib/auth.js';

/**
 * Extracts API key from request header
 */
function extractApiKey(c: Context): string | null {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return null;
  }

  // Support "Bearer <key>" and "ApiKey <key>" formats for API keys
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch && bearerMatch[1]) {
    const token = bearerMatch[1];
    // API keys start with 'ak_' prefix
    if (token.startsWith('ak_')) {
      return token;
    }
  }

  const apiKeyMatch = authHeader.match(/^ApiKey\s+(.+)$/i);
  if (apiKeyMatch && apiKeyMatch[1]) {
    return apiKeyMatch[1];
  }

  return null;
}

/**
 * Middleware to authenticate requests using better-auth sessions or API keys
 * - Dashboard uses better-auth session cookies
 * - External SDK uses API keys in Authorization header
 */
export function authMiddleware(db: Database, auth: Auth) {
  return async (c: Context, next: Next) => {
    // First, try to get session from better-auth (cookies)
    const session = await auth.api.getSession({ headers: c.req.raw.headers });

    if (session) {
      // User authenticated via better-auth session
      c.set('user', { ...session.user, image: session.user.image ?? null });
      c.set('session', session.session);
      
      // Get active organization if set
      const activeOrgId = session.session.activeOrganizationId;
      if (activeOrgId) {
        const [org] = await db
          .select()
          .from(organization)
          .where(eq(organization.id, activeOrgId))
          .limit(1);
        
        if (org) {
          c.set('organization', org);
        }
      }
      
      c.set('apiKey', null);
      await next();
      return;
    }

    // Try API key authentication for external SDK calls
    const apiKey = extractApiKey(c);
    if (apiKey) {
      const apiKeyHash = hashApiKey(apiKey);

      // Find organization with this API key
      // API keys are stored in organization_services
      const [orgService] = await db
        .select()
        .from(organizationServices)
        .where(eq(organizationServices.oauthClientId, apiKeyHash))
        .limit(1);

      if (orgService) {
        // Get the organization
        const [org] = await db
          .select()
          .from(organization)
          .where(eq(organization.id, orgService.organizationId))
          .limit(1);

        if (org) {
          c.set('organization', org);
          c.set('apiKey', apiKey);
          c.set('user', null);
          c.set('session', null);
          await next();
          return;
        }
      }

      return c.json(Errors.unauthorized('Invalid API key'), 401);
    }

    // No authentication found
    return c.json(Errors.unauthorized('Authentication required. Use session cookies or API key.'), 401);
  };
}
