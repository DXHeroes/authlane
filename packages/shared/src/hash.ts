/**
 * Hashing utilities
 */

import { createHash } from 'node:crypto';
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;

/**
 * Hashes an API key using SHA-256
 * @param apiKey The API key to hash
 * @returns Hex-encoded SHA-256 hash
 */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Hashes a password using bcrypt
 * @param password The password to hash
 * @returns Bcrypt hash of the password
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verifies a password against a bcrypt hash
 * @param password The password to verify
 * @param hash The bcrypt hash to verify against
 * @returns True if password matches hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (typeof password !== 'string' || typeof hash !== 'string') return false;
  return bcrypt.compare(password, hash);
}
