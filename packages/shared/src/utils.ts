/**
 * Utility functions
 */

/**
 * Validates a user ID
 * @param userId User ID to validate
 * @returns true if valid
 */
export function isValidUserId(userId: unknown): userId is string {
  return typeof userId === 'string' && userId.length > 0 && userId.length <= 255;
}

/**
 * Validates a service ID
 * @param serviceId Service ID to validate
 * @returns true if valid
 */
export function isValidServiceId(serviceId: unknown): serviceId is string {
  return (
    typeof serviceId === 'string' &&
    serviceId.length > 0 &&
    serviceId.length <= 100 &&
    /^[a-z0-9-]+$/.test(serviceId) // lowercase, alphanumeric, hyphens only
  );
}

/**
 * Checks if a date is expired
 * @param expiresAt ISO 8601 timestamp or null
 * @returns true if expired
 */
export function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) {
    return false;
  }
  return new Date(expiresAt) < new Date();
}

/**
 * Formats a date as ISO 8601
 * @param date Date to format
 * @returns ISO 8601 string
 */
export function toISO8601(date: Date): string {
  return date.toISOString();
}
