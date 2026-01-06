/**
 * Hash tests
 * Tests for bcrypt password/API key hashing and verification
 */

import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/hash.js';

describe('hash functions', () => {
  const testApiKey = 'sk_test_1234567890abcdefghijklmnopqrstuvwxyz';

  describe('hashPassword', () => {
    it('should hash API key successfully', async () => {
      const hash = await hashPassword(testApiKey);

      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
      expect(hash).not.toBe(testApiKey);
    });

    it('should produce bcrypt hash format', async () => {
      const hash = await hashPassword(testApiKey);

      // bcrypt hash format: $2a$10$ or $2b$10$
      expect(hash).toMatch(/^\$2[ayb]\$\d{2}\$/);
      expect(hash.length).toBeGreaterThanOrEqual(60);
    });

    it('should produce different hashes for same input (salt)', async () => {
      const hash1 = await hashPassword(testApiKey);
      const hash2 = await hashPassword(testApiKey);

      expect(hash1).not.toBe(hash2);
    });

    it('should hash different API keys differently', async () => {
      const hash1 = await hashPassword('sk_test_key1');
      const hash2 = await hashPassword('sk_test_key2');

      expect(hash1).not.toBe(hash2);
    });

    it('should hash empty string', async () => {
      const hash = await hashPassword('');

      expect(hash).toBeTruthy();
      expect(hash).toMatch(/^\$2[ayb]\$\d{2}\$/);
    });

    it('should hash long API keys', async () => {
      const longKey = `sk_test_${'a'.repeat(1000)}`;
      const hash = await hashPassword(longKey);

      expect(hash).toBeTruthy();
      expect(hash).toMatch(/^\$2[ayb]\$\d{2}\$/);
    });

    it('should hash special characters', async () => {
      const specialKey = 'sk_test_!@#$%^&*()_+-=[]{}|;:,.<>?';
      const hash = await hashPassword(specialKey);

      expect(hash).toBeTruthy();
      expect(hash).toMatch(/^\$2[ayb]\$\d{2}\$/);
    });

    it('should hash Unicode characters', async () => {
      const unicodeKey = 'sk_test_🔐_中文_Šifrování';
      const hash = await hashPassword(unicodeKey);

      expect(hash).toBeTruthy();
      expect(hash).toMatch(/^\$2[ayb]\$\d{2}\$/);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct API key', async () => {
      const hash = await hashPassword(testApiKey);
      const isValid = await verifyPassword(testApiKey, hash);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect API key', async () => {
      const hash = await hashPassword(testApiKey);
      const isValid = await verifyPassword('wrong_api_key', hash);

      expect(isValid).toBe(false);
    });

    it('should reject empty string against valid hash', async () => {
      const hash = await hashPassword(testApiKey);
      const isValid = await verifyPassword('', hash);

      expect(isValid).toBe(false);
    });

    it('should verify empty string if hashed', async () => {
      const hash = await hashPassword('');
      const isValid = await verifyPassword('', hash);

      expect(isValid).toBe(true);
    });

    it('should handle case sensitivity correctly', async () => {
      const hash = await hashPassword('sk_test_ABC');
      const isValid = await verifyPassword('sk_test_abc', hash);

      expect(isValid).toBe(false); // bcrypt is case-sensitive
    });

    it('should reject similar but different keys', async () => {
      const hash = await hashPassword('sk_test_key1');
      const isValid = await verifyPassword('sk_test_key2', hash);

      expect(isValid).toBe(false);
    });

    it('should verify Unicode characters correctly', async () => {
      const unicodeKey = 'sk_test_🔐_中文';
      const hash = await hashPassword(unicodeKey);
      const isValid = await verifyPassword(unicodeKey, hash);

      expect(isValid).toBe(true);
    });

    it('should reject invalid hash format', async () => {
      const isValid = await verifyPassword(testApiKey, 'invalid-hash');

      expect(isValid).toBe(false);
    });

    it('should reject malformed bcrypt hash', async () => {
      const malformedHash = '$2a$10$invalid';
      const isValid = await verifyPassword(testApiKey, malformedHash);

      expect(isValid).toBe(false);
    });
  });

  describe('hash/verify round-trip', () => {
    const testCases = [
      'sk_test_simple',
      'sk_prod_1234567890',
      'sk_test_with_special!@#$%',
      'sk_test_🔐_emoji',
      `sk_test_${'long'.repeat(50)}`,
      '',
    ];

    it.each(testCases)('should hash and verify: %s', async (apiKey) => {
      const hash = await hashPassword(apiKey);
      const isValid = await verifyPassword(apiKey, hash);

      expect(isValid).toBe(true);
    });
  });

  describe('security properties', () => {
    it('should use appropriate cost factor (work factor)', async () => {
      const hash = await hashPassword(testApiKey);
      const costFactor = hash.substring(4, 6);
      const cost = parseInt(costFactor, 10);

      // bcrypt cost should be at least 10 for security
      expect(cost).toBeGreaterThanOrEqual(10);
      expect(cost).toBeLessThanOrEqual(15); // Reasonable upper bound
    });

    it('should not be reversible', async () => {
      const hash = await hashPassword(testApiKey);

      // Hash should not contain any part of the original key
      expect(hash.toLowerCase()).not.toContain(testApiKey.toLowerCase());
    });

    it('should resist timing attacks (constant time)', async () => {
      const hash = await hashPassword('sk_test_correct');

      // Both verifications should take similar time (constant time comparison)
      const start1 = Date.now();
      await verifyPassword('sk_test_correct', hash);
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      await verifyPassword('sk_test_wrong', hash);
      const time2 = Date.now() - start2;

      // Time difference should be minimal (< 100ms) - bcrypt is constant time
      const timeDiff = Math.abs(time1 - time2);
      expect(timeDiff).toBeLessThan(100);
    });

    it('should be computationally expensive (min 50ms)', async () => {
      const start = Date.now();
      await hashPassword(testApiKey);
      const elapsed = Date.now() - start;

      // bcrypt should take at least 50ms with cost factor 10
      expect(elapsed).toBeGreaterThan(50);
    });

    it('should produce unique salts', async () => {
      const hash1 = await hashPassword(testApiKey);
      const hash2 = await hashPassword(testApiKey);

      const salt1 = hash1.substring(0, 29); // $2a$10$ + 22 char salt
      const salt2 = hash2.substring(0, 29);

      expect(salt1).not.toBe(salt2);
    });
  });

  describe('error handling', () => {
    it('should handle null hash gracefully', async () => {
      const isValid = await verifyPassword(testApiKey, null as any);

      expect(isValid).toBe(false);
    });

    it('should handle undefined hash gracefully', async () => {
      const isValid = await verifyPassword(testApiKey, undefined as any);

      expect(isValid).toBe(false);
    });

    it('should handle null API key gracefully', async () => {
      const hash = await hashPassword(testApiKey);
      const isValid = await verifyPassword(null as any, hash);

      expect(isValid).toBe(false);
    });
  });
});
