import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Keyring } from './keyring.js';

const DIGEST_PATTERN = /^([A-Za-z0-9][A-Za-z0-9._-]{0,63}):([A-Za-z0-9_-]{43})$/;
const API_KEY_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function digest(value: string, key: Buffer): Buffer {
  return createHmac('sha256', key).update('authlane.lookup.v1\0').update(value, 'utf8').digest();
}

export function createLookupDigest(value: string, keyring: Keyring): string {
  const key = keyring.keys.get(keyring.currentKeyId);
  if (!key) throw new Error(`Unknown key version: ${keyring.currentKeyId}`);
  return `${keyring.currentKeyId}:${digest(value, key).toString('base64url')}`;
}

export function verifyLookupDigest(
  value: string,
  encodedDigest: string,
  keyring: Keyring
): boolean {
  const match = encodedDigest.match(DIGEST_PATTERN);
  if (!match) return false;
  const keyId = match[1];
  const expectedValue = match[2];
  if (!keyId || !expectedValue) return false;
  const key = keyring.keys.get(keyId);
  if (!key) return false;
  const expected = Buffer.from(expectedValue, 'base64url');
  const actual = digest(value, key);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export interface IssuedApiKey {
  rawKey: string;
  keyHash: string;
  keyHint: string;
}

export function createApiKey(recordId: string, keyring: Keyring): IssuedApiKey {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(recordId)) {
    throw new Error('API key record id contains unsupported characters');
  }
  const secret = randomBytes(32).toString('base64url');
  const keyHint = `ak_live_${recordId}`;
  const rawKey = `${keyHint}_${secret}`;
  return { rawKey, keyHash: createLookupDigest(rawKey, keyring), keyHint };
}

export function verifyApiKey(
  rawKey: string,
  recordId: string,
  keyHash: string,
  keyring: Keyring
): boolean {
  const prefix = `ak_live_${recordId}_`;
  if (!rawKey.startsWith(prefix)) return false;
  const secret = rawKey.slice(prefix.length);
  return API_KEY_SECRET_PATTERN.test(secret) && verifyLookupDigest(rawKey, keyHash, keyring);
}

export function apiKeyRecordId(rawKey: string): string | null {
  const match = rawKey.match(/^ak_live_([A-Za-z0-9][A-Za-z0-9_-]{0,127})_([A-Za-z0-9_-]{43})$/);
  return match?.[1] ?? null;
}
