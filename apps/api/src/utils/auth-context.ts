/**
 * Authentication context utilities
 */

import type { Context } from 'hono';
import type { User, Organization } from '@authlane/database';

/**
 * Gets user from context, throws if not found
 */
export function getUser(c: Context): User {
  const user = c.get('user');
  if (!user) {
    throw new Error('User context not found');
  }
  return user;
}

/**
 * Gets user ID from context, throws if not found
 */
export function getUserId(c: Context): string {
  return getUser(c).id;
}

/**
 * Gets active organization from context, returns null if none selected
 */
export function getActiveOrganization(c: Context): Organization | null {
  return c.get('organization') || null;
}

/**
 * Gets active organization ID from context, returns null if none selected
 */
export function getActiveOrganizationId(c: Context): string | null {
  const org = getActiveOrganization(c);
  return org?.id || null;
}

/**
 * Requires an active organization, throws if not found
 */
export function requireOrganization(c: Context): Organization {
  const org = getActiveOrganization(c);
  if (!org) {
    throw new Error('No active organization. Please select an organization first.');
  }
  return org;
}

/**
 * Requires an active organization ID, throws if not found
 */
export function requireOrganizationId(c: Context): string {
  return requireOrganization(c).id;
}

/**
 * Gets API key from context (for external SDK calls)
 */
export function getApiKey(c: Context): string | null {
  return c.get('apiKey') || null;
}

/**
 * Checks if request is authenticated via API key (external) or session (dashboard)
 */
export function isApiKeyAuth(c: Context): boolean {
  return !!c.get('apiKey');
}








