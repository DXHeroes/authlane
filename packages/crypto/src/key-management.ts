/**
 * Key management utilities
 * Supports environment variables and future Vault integration
 */

/**
 * Gets the encryption key from environment or throws
 * @returns 32-byte hex string (64 hex characters)
 */
export function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required. ' + 'Generate with: openssl rand -hex 32'
    );
  }

  // Validate key length (32 bytes = 64 hex characters)
  if (key.length !== 64) {
    throw new Error(
      `ENCRYPTION_KEY must be 64 hex characters (32 bytes). Got ${key.length} characters.`
    );
  }

  // Validate hex format
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('ENCRYPTION_KEY must be a valid hex string');
  }

  return key;
}

/**
 * Future: Get encryption key from Vault
 * @param keyPath Path to the key in Vault
 * @returns Encryption key
 */
export async function getEncryptionKeyFromVault(_keyPath: string): Promise<string> {
  // TODO: Implement Vault integration
  // For now, fall back to environment variable
  return getEncryptionKey();
}
