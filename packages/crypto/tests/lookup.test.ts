import { describe, expect, it } from 'vitest';
import {
  createApiKey,
  createLookupDigest,
  parseKeyring,
  verifyApiKey,
  verifyLookupDigest,
} from '../src/index.js';

const ring = parseKeyring(`lookup-v2:${'22'.repeat(32)},lookup-v1:${'11'.repeat(32)}`);

describe('keyed lookup digests', () => {
  it('binds a digest to a versioned HMAC key without storing the bearer', () => {
    const digest = createLookupDigest('bearer-secret', ring);

    expect(digest).toMatch(/^lookup-v2:[A-Za-z0-9_-]{43}$/);
    expect(digest).not.toContain('bearer-secret');
    expect(verifyLookupDigest('bearer-secret', digest, ring)).toBe(true);
    expect(verifyLookupDigest('other-secret', digest, ring)).toBe(false);
  });

  it('verifies digests created with a retained previous key during rotation', () => {
    const oldRing = parseKeyring(`lookup-v1:${'11'.repeat(32)}`);
    const oldDigest = createLookupDigest('bearer-secret', oldRing);

    expect(verifyLookupDigest('bearer-secret', oldDigest, ring)).toBe(true);
  });

  it('issues API keys with an opaque record id and 256-bit secret', () => {
    const issued = createApiKey('key_123', ring);

    expect(issued.rawKey).toMatch(/^ak_live_key_123_[A-Za-z0-9_-]{43}$/);
    expect(issued.keyHint).toBe('ak_live_key_123');
    expect(verifyApiKey(issued.rawKey, 'key_123', issued.keyHash, ring)).toBe(true);
    expect(verifyApiKey(issued.rawKey, 'key_other', issued.keyHash, ring)).toBe(false);
  });
});
