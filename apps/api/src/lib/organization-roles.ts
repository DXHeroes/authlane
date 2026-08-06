/**
 * What a signed-in user is allowed to do inside one organization.
 *
 * The dashboard's administrative endpoints all ask the same question — is this user an owner, an
 * admin, or an ordinary member of the workspace they are acting on — and each one used to answer it
 * with its own copy of the same `member` lookup. What is shared here is that lookup, and the
 * predicates over its result: one place to change when roles grow.
 *
 * The refusal is still each endpoint's own. `dashboard.ts` answers a failed role check with
 * `Errors.unauthorized` at 403 while the OAuth clients router answers `Errors.insufficientScope`,
 * so a caller cannot rely on one error shape across the dashboard surface. Unifying that is a
 * separate change with its own blast radius on the dashboard client.
 *
 * Membership itself is established upstream: `authMiddleware` only sets `organization` from the
 * session's active organization, so these helpers decide the level of access, not whether the user
 * belongs to the workspace at all.
 */

import { and, type Database, eq, member } from '@authlane/database';

/** The caller's role in an organization, or null when they are not a member of it. */
export async function readOrganizationRole(
  db: Database,
  organizationId: string,
  userId: string
): Promise<string | null> {
  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1);

  return membership?.role ?? null;
}

/** Whether a role may administer the workspace: change its settings, its people, its clients. */
export function isOrganizationAdmin(role: string | null): boolean {
  return role === 'owner' || role === 'admin';
}

/** Whether a role may take the actions reserved for owners, such as deleting the workspace. */
export function isOrganizationOwner(role: string | null): boolean {
  return role === 'owner';
}
