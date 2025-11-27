import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const KEY_LENGTH = 32; // 256 bits

/**
 * Encrypts data using AES-256-GCM
 * @param text Plain text to encrypt
 * @param keyHex 32-byte hex string (64 hex characters)
 * @returns Encrypted data as base64 string (format: iv:authTag:encryptedData)
 */
export function encrypt(text: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `Encryption key must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex characters)`
    );
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encryptedData (all base64)
  const result = [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');

  return result;
}

/**
 * Decrypts data encrypted with AES-256-GCM
 * @param encryptedData Base64 string in format: iv:authTag:encryptedData
 * @param keyHex 32-byte hex string (64 hex characters)
 * @returns Decrypted plain text
 */
export function decrypt(encryptedData: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `Encryption key must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex characters)`
    );
  }

  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format. Expected: iv:authTag:encryptedData');
  }

  const [ivBase64, authTagBase64, encryptedBase64] = parts;

  if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
    throw new Error('Invalid encrypted data format. Missing required parts');
  }

  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  const encrypted = Buffer.from(encryptedBase64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}

/**
 * Generates a random encryption key (32 bytes = 256 bits)
 * @returns Hex string (64 characters)
 */
export function generateKey(): string {
  return randomBytes(KEY_LENGTH).toString('hex');
}
