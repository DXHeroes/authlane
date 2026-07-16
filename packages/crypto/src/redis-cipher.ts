import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Keyring } from './keyring.js';

const FORMAT_VERSION = 'v1';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function additionalData(keyId: string, logicalKey: string): Buffer {
  if (!logicalKey || logicalKey.length > 1024) {
    throw new Error('Redis logical key must contain between 1 and 1024 characters');
  }
  return Buffer.from(`authlane:redis:${FORMAT_VERSION}:${keyId}:${logicalKey}`, 'utf8');
}

export function sealRedisValue(keyring: Keyring, logicalKey: string, plaintext: string): string {
  const keyId = keyring.currentKeyId;
  const key = keyring.keys.get(keyId);
  if (!key) throw new Error(`Current Redis encryption key is unavailable: ${keyId}`);

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LENGTH });
  cipher.setAAD(additionalData(keyId, logicalKey));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    FORMAT_VERSION,
    keyId,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function openRedisValue(keyring: Keyring, logicalKey: string, sealed: string): string {
  const parts = sealed.split(':');
  if (parts.length !== 5 || parts[0] !== FORMAT_VERSION) {
    throw new Error('Invalid encrypted Redis value format');
  }
  const [, keyId, ivEncoded, tagEncoded, ciphertextEncoded] = parts;
  if (
    !keyId ||
    ivEncoded === undefined ||
    tagEncoded === undefined ||
    ciphertextEncoded === undefined
  ) {
    throw new Error('Invalid encrypted Redis value format');
  }
  const key = keyring.keys.get(keyId);
  if (!key) throw new Error(`Unknown Redis encryption key version: ${keyId}`);

  const iv = Buffer.from(ivEncoded, 'base64url');
  const tag = Buffer.from(tagEncoded, 'base64url');
  const ciphertext = Buffer.from(ciphertextEncoded, 'base64url');
  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new Error('Invalid encrypted Redis value parameters');
  }

  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAAD(additionalData(keyId, logicalKey));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
