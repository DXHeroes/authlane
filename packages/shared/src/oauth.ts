/**
 * OAuth2 utilities
 * PKCE (Proof Key for Code Exchange) implementation
 */

import { createHash, randomBytes } from 'node:crypto';

/**
 * Generates PKCE code verifier and challenge
 * @returns Object with code_verifier and code_challenge
 */
export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  // Code verifier: 43-128 characters, URL-safe
  const codeVerifier = base64URLEncode(randomBytes(32));

  // Code challenge: SHA256 hash of code verifier, base64url encoded
  const codeChallenge = base64URLEncode(createHash('sha256').update(codeVerifier).digest());

  return { codeVerifier, codeChallenge };
}

/**
 * Base64 URL-safe encoding (RFC 4648)
 */
function base64URLEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Generates a cryptographically random state parameter for OAuth
 * @returns Base64 URL-safe encoded random string
 */
export function generateState(): string {
  return base64URLEncode(randomBytes(32));
}

/**
 * Validates PKCE code verifier against challenge
 */
export function verifyPKCE(codeVerifier: string, codeChallenge: string): boolean {
  const computedChallenge = base64URLEncode(createHash('sha256').update(codeVerifier).digest());
  return computedChallenge === codeChallenge;
}
