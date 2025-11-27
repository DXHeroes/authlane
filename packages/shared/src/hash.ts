/**
 * Hashing utilities
 */

import { createHash } from 'node:crypto';

/**
 * Hashes an API key using SHA-256
 * @param apiKey The API key to hash
 * @returns Hex-encoded SHA-256 hash
 */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}
