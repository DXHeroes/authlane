/**
 * The OAuth clients a workspace has registered against Authlane's authorization server.
 *
 * A downstream SaaS pairs user identities with a workspace over authorization code + PKCE, and this
 * is where that workspace registers the application allowed to do it. RFC 7591 dynamic registration
 * is closed (see the /oauth2/register block in index.ts), so every `oauth_application` row in the
 * database was written here or by the local development seed.
 *
 * TENANT ISOLATION IS THIS FILE'S JOB. `oauth_application` is an auth-plane table with no row level
 * security policy, and `authlane_runtime` holds full DML on it through the schema-wide grant — the
 * database will happily return another workspace's client. Every statement below therefore carries
 * `eq(oauthApplication.organizationId, org.id)`, and a client that belongs to somebody else is
 * answered with 404 rather than 403, so the endpoint never confirms that an id exists elsewhere.
 *
 * Mutations are restricted to owners and admins, which the API keys endpoints deliberately are not.
 * A client's redirect URI is where end-user identities get delivered, so adding one is a way to
 * redirect other people's logins, and deleting a client takes down every pairing that depends on
 * it. An API key only ever acts as the tenant itself; this is a larger blast radius, and it is worth
 * the divergence. Reading the list stays open to any member.
 *
 * KNOWN GAP: there is no secret rotation. A workspace that loses its client secret has to delete the
 * client and register a new one, which breaks every existing pairing rather than re-keying it.
 * Deliberate for v1 — closing it means an endpoint that reseals `client_secret` in place while the
 * old secret keeps working for a grace period, which is a design of its own.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { encryptOAuthClientSecret } from '@authlane/crypto';
import {
  and,
  type Database,
  desc,
  eq,
  type OAuthApplication,
  oauthApplication,
} from '@authlane/database';
import { Errors } from '@authlane/shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { logger } from '../lib/logger.js';
import {
  parseOAuthClientRegistration,
  parseOAuthClientUpdate,
  redirectUrisFromStorage,
  redirectUrisToStorage,
} from '../lib/oauth-client-input.js';
import { isOrganizationAdmin, readOrganizationRole } from '../lib/organization-roles.js';

/** 24 random bytes render as exactly 32 URL-safe characters. */
const CLIENT_ID_BYTES = 24;
const CLIENT_SECRET_BYTES = 32;
const CLIENT_SECRET_PREFIX = 'alcs_';

function generateClientId(): string {
  return randomBytes(CLIENT_ID_BYTES).toString('base64url');
}

function generateClientSecret(): string {
  return `${CLIENT_SECRET_PREFIX}${randomBytes(CLIENT_SECRET_BYTES).toString('base64url')}`;
}

/**
 * The client as the dashboard sees it.
 *
 * There is no branch here that can reach `clientSecret`: the column is never selected, so neither
 * the plaintext nor its ciphertext can leave through this router after the one response that
 * issues it.
 */
const clientColumns = {
  id: oauthApplication.id,
  name: oauthApplication.name,
  clientId: oauthApplication.clientId,
  redirectUrls: oauthApplication.redirectUrls,
  disabled: oauthApplication.disabled,
  createdAt: oauthApplication.createdAt,
  updatedAt: oauthApplication.updatedAt,
};

type ClientRow = Pick<OAuthApplication, keyof typeof clientColumns>;

function present(row: ClientRow) {
  return {
    id: row.id,
    name: row.name,
    clientId: row.clientId,
    redirectUris: redirectUrisFromStorage(row.redirectUrls),
    disabled: row.disabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createOAuthClientsRouter(db: Database) {
  const router = new Hono();

  /**
   * Resolves who is behind a mutating request, or the refusal to send instead of doing the work.
   *
   * The 403 is `insufficientScope`, matching `requirePrincipalKind` on this same sub-app: the
   * body's own `statusCode` then agrees with the HTTP status. The role refusals in `dashboard.ts`
   * answer 403 with an `unauthorized` body that claims 401, which is a wart worth not spreading.
   */
  async function requireAdministrator(
    c: Context
  ): Promise<{ organizationId: string; userId: string } | Response> {
    const org = c.get('organization');
    const user = c.get('user');
    if (!org || !user) {
      return c.json(Errors.unauthorized('Organization context required'), 401);
    }

    if (!isOrganizationAdmin(await readOrganizationRole(db, org.id, user.id))) {
      return c.json(
        Errors.insufficientScope('Only admins and owners can manage OAuth clients'),
        403
      );
    }

    return { organizationId: org.id, userId: user.id };
  }

  /**
   * GET /api/v1/dashboard/oauth-clients
   * Every OAuth client registered by the active organization, disabled ones included.
   *
   * Open to any member: the active organization comes from the session, so reaching this at all
   * means membership, and nothing here is a credential. Only the mutations need a role.
   */
  router.get('/oauth-clients', async (c) => {
    try {
      const org = c.get('organization');
      if (!org) {
        return c.json(Errors.unauthorized('Organization context required'), 401);
      }

      const clients = await db
        .select(clientColumns)
        .from(oauthApplication)
        .where(eq(oauthApplication.organizationId, org.id))
        .orderBy(desc(oauthApplication.createdAt));

      return c.json({ data: clients.map(present), error: null });
    } catch (error) {
      logger.error({ error, requestId: c.get('requestId') }, 'Failed to list OAuth clients');
      return c.json(Errors.internalError('Failed to retrieve OAuth clients'), 500);
    }
  });

  /**
   * POST /api/v1/dashboard/oauth-clients
   * Registers a client and discloses its secret once.
   *
   * The secret is stored sealed and is never readable again — not by this router, not by the
   * dashboard. A workspace that loses it registers a new client.
   */
  router.post('/oauth-clients', async (c) => {
    try {
      const administrator = await requireAdministrator(c);
      if (administrator instanceof Response) return administrator;

      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json(
          Errors.validationError('Invalid JSON body', 'Request body must be valid JSON'),
          400
        );
      }

      const parsed = parseOAuthClientRegistration(body);
      if (!parsed.ok) {
        return c.json(Errors.validationError(parsed.error, parsed.hint), 400);
      }
      const { registration } = parsed;

      const clientSecret = generateClientSecret();
      const [created] = await db
        .insert(oauthApplication)
        .values({
          id: `oauth_client_${randomUUID()}`,
          name: registration.name,
          clientId: generateClientId(),
          clientSecret: await encryptOAuthClientSecret(clientSecret),
          redirectUrls: redirectUrisToStorage(registration.redirectUris),
          type: 'web',
          disabled: false,
          // The workspace owns the client; the registering user is recorded but incidental, and
          // the column nulls rather than cascades when they leave.
          userId: administrator.userId,
          organizationId: administrator.organizationId,
        })
        .returning(clientColumns);

      if (!created) {
        return c.json(Errors.internalError('Failed to create OAuth client'), 500);
      }

      // The one response carrying the secret must not sit in any cache, the same treatment a
      // rotated webhook signing secret gets.
      c.header('Cache-Control', 'no-store, private');
      c.header('Pragma', 'no-cache');
      return c.json(
        {
          data: {
            ...present(created),
            // Shown once. Nothing else in Authlane can return it again.
            clientSecret,
          },
          error: null,
        },
        201
      );
    } catch (error) {
      logger.error({ error, requestId: c.get('requestId') }, 'Failed to create OAuth client');
      return c.json(Errors.internalError('Failed to create OAuth client'), 500);
    }
  });

  /**
   * PATCH /api/v1/dashboard/oauth-clients/:id
   * Updates the redirect URIs, the name, or whether the client is disabled.
   */
  router.patch('/oauth-clients/:id', async (c) => {
    try {
      const administrator = await requireAdministrator(c);
      if (administrator instanceof Response) return administrator;

      const clientRowId = c.req.param('id');

      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json(
          Errors.validationError('Invalid JSON body', 'Request body must be valid JSON'),
          400
        );
      }

      const parsed = parseOAuthClientUpdate(body);
      if (!parsed.ok) {
        return c.json(Errors.validationError(parsed.error, parsed.hint), 400);
      }
      const { update } = parsed;

      const [updated] = await db
        .update(oauthApplication)
        .set({
          ...(update.name !== undefined ? { name: update.name } : {}),
          ...(update.redirectUris !== undefined
            ? { redirectUrls: redirectUrisToStorage(update.redirectUris) }
            : {}),
          ...(update.disabled !== undefined ? { disabled: update.disabled } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(oauthApplication.id, clientRowId),
            eq(oauthApplication.organizationId, administrator.organizationId)
          )
        )
        .returning(clientColumns);

      // Another workspace's client is indistinguishable from one that does not exist.
      if (!updated) {
        return c.json(Errors.notFound('OAuth client', clientRowId), 404);
      }

      return c.json({ data: present(updated), error: null });
    } catch (error) {
      logger.error({ error, requestId: c.get('requestId') }, 'Failed to update OAuth client');
      return c.json(Errors.internalError('Failed to update OAuth client'), 500);
    }
  });

  /**
   * DELETE /api/v1/dashboard/oauth-clients/:id
   * Removes the client. Its access tokens and consents cascade away with it.
   */
  router.delete('/oauth-clients/:id', async (c) => {
    try {
      const administrator = await requireAdministrator(c);
      if (administrator instanceof Response) return administrator;

      const clientRowId = c.req.param('id');
      const [deleted] = await db
        .delete(oauthApplication)
        .where(
          and(
            eq(oauthApplication.id, clientRowId),
            eq(oauthApplication.organizationId, administrator.organizationId)
          )
        )
        .returning({ id: oauthApplication.id });

      if (!deleted) {
        return c.json(Errors.notFound('OAuth client', clientRowId), 404);
      }

      return c.json({ data: { deleted: true }, error: null });
    } catch (error) {
      logger.error({ error, requestId: c.get('requestId') }, 'Failed to delete OAuth client');
      return c.json(Errors.internalError('Failed to delete OAuth client'), 500);
    }
  });

  return router;
}
