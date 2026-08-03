/**
 * Team Invitation Logic
 * Handles creating, validating, and processing organization invitations
 */

import crypto from 'node:crypto';
import type { Database } from '@authlane/database';
import { and, eq, invitation, member, user } from '@authlane/database';
import { sendOrganizationInvitation } from '@authlane/email';
import { Errors, type Result } from '@authlane/shared';
import { buildInvitationLink, getAppUrl } from './app-url.js';
import { logger } from './logger.js';

export interface InvitationContext {
  id: string;
  email: string;
  role: string;
  organizationId: string;
  organizationName: string;
  invitedBy: string;
  expiresAt: Date;
}

/**
 * Check if a user is already a member or has a pending invitation
 *
 * @param email - Email to check
 * @param organizationId - Organization ID
 * @param db - Database instance
 * @returns Whether user is already member or invited
 */
async function isAlreadyMemberOrInvited(
  email: string,
  organizationId: string,
  db: Database
): Promise<boolean> {
  // Check for existing invitation
  const [existingInvitation] = await db
    .select()
    .from(invitation)
    .where(and(eq(invitation.email, email), eq(invitation.organizationId, organizationId)))
    .limit(1);

  if (existingInvitation && new Date(existingInvitation.expiresAt) > new Date()) {
    return true; // Active invitation exists
  }

  // Check if already a member (would require user lookup)
  // For now, we'll just check invitations
  // TODO: Add check for existing members once we have user lookup by email

  return false;
}

/**
 * Create a new organization invitation
 *
 * @param email - Email to invite
 * @param role - Role to assign (owner, admin, member)
 * @param organizationId - Organization ID
 * @param organizationName - Organization name
 * @param invitedBy - User ID of inviter
 * @param db - Database instance
 * @returns Invitation context
 */
interface InviterRecord {
  name: string | null;
  email: string;
}

/** Resolves a display name for the invitation email, degrading rather than failing. */
export async function resolveInviterName(
  lookup: () => Promise<InviterRecord | undefined>
): Promise<string> {
  try {
    const inviter = await lookup();
    if (!inviter) return 'A team member';
    return inviter.name?.trim() || inviter.email;
  } catch {
    return 'A team member';
  }
}

export async function createInvitation(
  email: string,
  role: string,
  organizationId: string,
  organizationName: string,
  invitedBy: string,
  db: Database
): Promise<Result<InvitationContext>> {
  try {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        data: null,
        error: Errors.validationError(
          'Invalid email format',
          'Please provide a valid email address'
        ),
      };
    }

    // Validate role
    const validRoles = ['owner', 'admin', 'member'];
    if (!validRoles.includes(role)) {
      return {
        data: null,
        error: Errors.validationError(
          'Invalid role',
          `Role must be one of: ${validRoles.join(', ')}`
        ),
      };
    }

    // Check if already member or invited
    const alreadyExists = await isAlreadyMemberOrInvited(email, organizationId, db);
    if (alreadyExists) {
      return {
        data: null,
        error: Errors.validationError(
          'User already invited or member',
          'This user has already been invited or is already a member'
        ),
      };
    }

    // Create invitation
    const invitationId = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    const [newInvitation] = await db
      .insert(invitation)
      .values({
        id: invitationId,
        email,
        role,
        organizationId,
        inviterId: invitedBy,
        expiresAt,
        status: 'pending',
      })
      .returning();

    if (!newInvitation) {
      return {
        data: null,
        error: Errors.internalError('Failed to create invitation'),
      };
    }

    // Send invitation email
    try {
      const inviterName = await resolveInviterName(async () => {
        const [record] = await db
          .select({ name: user.name, email: user.email })
          .from(user)
          .where(eq(user.id, invitedBy))
          .limit(1);
        return record;
      });

      const inviteLink = buildInvitationLink(getAppUrl(), invitationId);

      await sendOrganizationInvitation(email, {
        inviterName,
        organizationName,
        inviteLink,
        role,
        expiresIn: '7 days',
      });
    } catch (emailError) {
      logger.error({ error: emailError, organizationId }, 'Failed to send invitation email');
      // Don't fail the invitation creation if email fails
      // The invitation is still valid
    }

    return {
      data: {
        id: invitationId,
        email,
        role,
        organizationId,
        organizationName,
        invitedBy,
        expiresAt,
      },
      error: null,
    };
  } catch (error) {
    logger.error({ error, organizationId }, 'Failed to create invitation');
    return {
      data: null,
      error: Errors.internalError('Failed to create invitation'),
    };
  }
}

/**
 * Validate that a user cannot remove the last owner
 *
 * @param organizationId - Organization ID
 * @param memberId - Member ID to remove
 * @param db - Database instance
 * @returns Validation result
 */
export async function validateNotLastOwner(
  organizationId: string,
  memberId: string,
  db: Database
): Promise<Result<true>> {
  try {
    // Get the member being removed
    const [memberToRemove] = await db
      .select()
      .from(member)
      .where(and(eq(member.id, memberId), eq(member.organizationId, organizationId)))
      .limit(1);

    if (!memberToRemove) {
      return {
        data: null,
        error: Errors.notFound('Member', memberId),
      };
    }

    // Only check if removing an owner
    if (memberToRemove.role !== 'owner') {
      return {
        data: true,
        error: null,
      };
    }

    // Count remaining owners
    const owners = await db
      .select()
      .from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.role, 'owner')));

    if (owners.length <= 1) {
      return {
        data: null,
        error: Errors.validationError(
          'Cannot remove last owner',
          'Organization must have at least one owner'
        ),
      };
    }

    return {
      data: true,
      error: null,
    };
  } catch (error) {
    logger.error({ error, organizationId }, 'Failed to validate owner removal');
    return {
      data: null,
      error: Errors.internalError('Failed to validate member removal'),
    };
  }
}
