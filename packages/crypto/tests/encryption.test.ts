/**
 * Encryption tests
 * Tests for AES-256-GCM encryption and decryption
 */

import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, generateKey } from '../src/encryption';

describe('encryption', () => {
  const testKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 64 hex chars

  describe('generateKey', () => {
    it('should generate a valid 64-character hex key', () => {
      const key = generateKey();
      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate different keys each time', () => {
      const key1 = generateKey();
      const key2 = generateKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe('encrypt', () => {
    it('should encrypt plain text successfully', () => {
      const plainText = 'Hello, World!';
      const encrypted = encrypt(plainText, testKey);

      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(plainText);
      expect(encrypted.split(':')).toHaveLength(3); // iv:authTag:encryptedData
    });

    it('should produce different ciphertext for the same plaintext', () => {
      const plainText = 'Test message';
      const encrypted1 = encrypt(plainText, testKey);
      const encrypted2 = encrypt(plainText, testKey);

      expect(encrypted1).not.toBe(encrypted2); // Different IVs
    });

    it('should encrypt empty string', () => {
      const encrypted = encrypt('', testKey);
      expect(encrypted).toBeTruthy();
      expect(encrypted.split(':')).toHaveLength(3);
    });

    it('should encrypt JSON data', () => {
      const jsonData = JSON.stringify({ token: 'abc123', expires: 3600 });
      const encrypted = encrypt(jsonData, testKey);
      expect(encrypted).toBeTruthy();
    });

    it('should throw error for invalid key length', () => {
      expect(() => encrypt('test', 'short-key')).toThrow(/Encryption key must be/);
    });

    it('should throw error for non-hex key', () => {
      const invalidKey = 'z'.repeat(64); // Not hex
      expect(() => encrypt('test', invalidKey)).toThrow();
    });
  });

  describe('decrypt', () => {
    it('should decrypt encrypted data successfully', () => {
      const plainText = 'Secret message';
      const encrypted = encrypt(plainText, testKey);
      const decrypted = decrypt(encrypted, testKey);

      expect(decrypted).toBe(plainText);
    });

    it('should decrypt JSON data', () => {
      const jsonData = { access_token: 'token123', refresh_token: 'refresh456' };
      const jsonString = JSON.stringify(jsonData);
      const encrypted = encrypt(jsonString, testKey);
      const decrypted = decrypt(encrypted, testKey);

      expect(decrypted).toBe(jsonString);
      expect(JSON.parse(decrypted)).toEqual(jsonData);
    });

    it('should decrypt empty string', () => {
      const encrypted = encrypt('', testKey);
      const decrypted = decrypt(encrypted, testKey);

      expect(decrypted).toBe('');
    });

    it('should decrypt Unicode characters', () => {
      const plainText = '🔐 Šifrování s českými znaky 中文';
      const encrypted = encrypt(plainText, testKey);
      const decrypted = decrypt(encrypted, testKey);

      expect(decrypted).toBe(plainText);
    });

    it('should throw error for invalid encrypted data format', () => {
      expect(() => decrypt('invalid-format', testKey)).toThrow(/Invalid encrypted data format/);
    });

    it('should throw error for missing parts', () => {
      expect(() => decrypt('part1:part2', testKey)).toThrow(/Invalid encrypted data format/);
    });

    it('should throw error for too many parts', () => {
      expect(() => decrypt(':::', testKey)).toThrow(/Invalid encrypted data format/);
    });

    it('should throw error for wrong key', () => {
      const plainText = 'Secret';
      const encrypted = encrypt(plainText, testKey);
      const wrongKey = generateKey();

      expect(() => decrypt(encrypted, wrongKey)).toThrow();
    });

    it('should throw error for tampered data', () => {
      const plainText = 'Secret';
      const encrypted = encrypt(plainText, testKey);
      const parts = encrypted.split(':');
      const tamperedData = `${parts[0]}:${parts[1]}:${parts[2]}XXX`; // Tamper with encrypted data

      expect(() => decrypt(tamperedData, testKey)).toThrow();
    });

    it('should throw error for invalid key length', () => {
      const encrypted = encrypt('test', testKey);
      expect(() => decrypt(encrypted, 'short-key')).toThrow(/Encryption key must be/);
    });
  });

  describe('encrypt/decrypt round-trip', () => {
    const testCases = [
      'Simple text',
      'Text with\nnewlines\nand\ttabs',
      '{"complex": "json", "with": {"nested": "objects"}}',
      'Very long text '.repeat(100),
      '🎉🔐💯',
      '',
    ];

    it.each(testCases)('should correctly encrypt and decrypt: %s', (plainText) => {
      const encrypted = encrypt(plainText, testKey);
      const decrypted = decrypt(encrypted, testKey);
      expect(decrypted).toBe(plainText);
    });
  });

  describe('security properties', () => {
    it('should use different IVs for each encryption', () => {
      const plainText = 'test';
      const encrypted1 = encrypt(plainText, testKey);
      const encrypted2 = encrypt(plainText, testKey);

      const iv1 = encrypted1.split(':')[0];
      const iv2 = encrypted2.split(':')[0];

      expect(iv1).not.toBe(iv2);
    });

    it('should include authentication tag', () => {
      const plainText = 'test';
      const encrypted = encrypt(plainText, testKey);
      const parts = encrypted.split(':');

      expect(parts).toHaveLength(3);
      expect(parts[1]).toBeTruthy(); // Auth tag
      expect(parts[1].length).toBeGreaterThan(0);
    });
  });
});
