/**
 * Key management tests
 * Tests for encryption key retrieval and validation
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getEncryptionKey, getEncryptionKeyFromVault } from '../src/key-management';

describe('key-management', () => {
  const validKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.ENCRYPTION_KEY;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ENCRYPTION_KEY = originalEnv;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
  });

  describe('getEncryptionKey', () => {
    it('should return valid encryption key from environment', () => {
      process.env.ENCRYPTION_KEY = validKey;
      const key = getEncryptionKey();
      expect(key).toBe(validKey);
    });

    it('should accept uppercase hex characters', () => {
      const upperKey = validKey.toUpperCase();
      process.env.ENCRYPTION_KEY = upperKey;
      const key = getEncryptionKey();
      expect(key).toBe(upperKey);
    });

    it('should accept mixed case hex characters', () => {
      const mixedKey = '0123456789ABCdef0123456789ABCdef0123456789ABCdef0123456789ABCdef';
      process.env.ENCRYPTION_KEY = mixedKey;
      const key = getEncryptionKey();
      expect(key).toBe(mixedKey);
    });

    it('should throw error when ENCRYPTION_KEY is not set', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(() => getEncryptionKey()).toThrow(/ENCRYPTION_KEY environment variable is required/);
    });

    it('should throw error for empty key', () => {
      process.env.ENCRYPTION_KEY = '';
      expect(() => getEncryptionKey()).toThrow(/ENCRYPTION_KEY environment variable is required/);
    });

    it('should throw error for key that is too short', () => {
      process.env.ENCRYPTION_KEY = '0123456789abcdef'; // Only 16 chars (8 bytes)
      expect(() => getEncryptionKey()).toThrow(/must be 64 hex characters/);
    });

    it('should throw error for key that is too long', () => {
      process.env.ENCRYPTION_KEY = `${validKey}extra`;
      expect(() => getEncryptionKey()).toThrow(/must be 64 hex characters/);
    });

    it('should throw error for non-hex characters', () => {
      process.env.ENCRYPTION_KEY = 'z'.repeat(64);
      expect(() => getEncryptionKey()).toThrow(/must be a valid hex string/);
    });

    it('should throw error for key with spaces', () => {
      process.env.ENCRYPTION_KEY = `${validKey.substring(0, 32)} ${validKey.substring(33)}`;
      expect(() => getEncryptionKey()).toThrow(/must be a valid hex string/);
    });

    it('should throw error for key with special characters', () => {
      process.env.ENCRYPTION_KEY = `${validKey.substring(0, 32)}@#${validKey.substring(34)}`;
      expect(() => getEncryptionKey()).toThrow(/must be a valid hex string/);
    });
  });

  describe('getEncryptionKeyFromVault', () => {
    it('should fall back to environment variable for now', async () => {
      process.env.ENCRYPTION_KEY = validKey;
      const key = await getEncryptionKeyFromVault('secret/encryption-key');
      expect(key).toBe(validKey);
    });

    it('should throw error when environment variable is not set', async () => {
      delete process.env.ENCRYPTION_KEY;
      await expect(getEncryptionKeyFromVault('secret/key')).rejects.toThrow(
        /ENCRYPTION_KEY environment variable is required/
      );
    });

    it('should validate key format even from vault', async () => {
      process.env.ENCRYPTION_KEY = 'invalid-key';
      await expect(getEncryptionKeyFromVault('secret/key')).rejects.toThrow(
        /must be 64 hex characters/
      );
    });
  });
});
