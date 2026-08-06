/**
 * The `workspace` claim Authlane adds to the OIDC userinfo response and the id_token.
 *
 * A downstream SaaS pairs a user against one Authlane workspace, so it needs to know which one the
 * token belongs to. The claim is deliberately singular: it describes the workspace that owns the
 * client the token was issued to, never the full list of the user's memberships.
 */

import { and, type Database, eq, member, oauthApplication, organization } from '@authlane/database';

/**
 * What the plugin hands `getAdditionalUserInfoClaim` as its `client` argument.
 *
 * The plugin projects a client row onto its own field list before returning it
 * (`getClient` in better-auth/dist/plugins/oidc-provider/index.mjs builds a fresh object literal),
 * so Authlane's `organization_id` column is not on it. `clientId` is the only usable handle, and
 * the organization has to be read back from the table.
 */
export interface OAuthClientIdentity {
  clientId: string;
}

export type WorkspaceClaim = {
  workspace: {
    id: string;
    slug: string;
    role: string;
  };
} & Record<string, unknown>;

/**
 * Resolves the workspace claim for a user against the client's own organization.
 *
 * Returns no claim rather than a partial one when the user is not a member: a token can outlive the
 * membership that justified it, and a consumer that requires the claim should then fail to pair
 * rather than receive a workspace the user no longer belongs to.
 */
export async function resolveWorkspaceClaim(
  db: Database,
  userId: string,
  clientId: string
): Promise<WorkspaceClaim | Record<string, never>> {
  if (!userId || !clientId) return {};

  const [row] = await db
    .select({
      id: organization.id,
      slug: organization.slug,
      role: member.role,
    })
    .from(oauthApplication)
    .innerJoin(organization, eq(organization.id, oauthApplication.organizationId))
    .innerJoin(member, and(eq(member.organizationId, organization.id), eq(member.userId, userId)))
    .where(eq(oauthApplication.clientId, clientId))
    .limit(1);

  if (!row) return {};
  return { workspace: { id: row.id, slug: row.slug, role: row.role } };
}

/**
 * Builds the `getAdditionalUserInfoClaim` callback the oidc-provider plugin calls on both the
 * userinfo endpoint and the id_token payload.
 */
export function createWorkspaceClaimResolver(db: Database) {
  return async (
    user: { id: string },
    _scopes: string[],
    client: OAuthClientIdentity
  ): Promise<Record<string, unknown>> => resolveWorkspaceClaim(db, user.id, client.clientId);
}
