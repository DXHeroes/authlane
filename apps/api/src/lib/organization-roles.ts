/**
 * What a signed-in user is allowed to do inside one organization.
 *
 * The dashboard's administrative endpoints all ask the same question — is this user an owner, an
 * admin, or an ordinary member of the workspace they are acting on — and each one used to answer it
 * with its own copy of the same `member` lookup. One shared answer means a new endpoint cannot
 * accidentally spell the check differently, and there is one place to change when roles grow.
 *
 * Membership itself is established upstream: `authMiddleware` only sets `organization` from the
 * session's active organization, so these helpers decide the level of access, not whether the user
 * belongs to the workspace at all.
 */

import { and, type Database, eq, member } from '@authlane/database';

/** Roles better-auth's organization plugin assigns. Stored as free text, so read defensively. */
export type OrganizationRole = 'owner' | 'admin' | 'member';

/** The caller's role in an organization, or null when they are not a member of it. */
export async function organizationRole(
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
