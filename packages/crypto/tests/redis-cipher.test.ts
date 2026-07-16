import { describe, expect, it } from 'vitest';
import { openRedisValue, parseKeyring, sealRedisValue } from '../src/index.js';

const current = 'a'.repeat(64);
const old = 'b'.repeat(64);

describe('encrypted Redis values', () => {
  it('encrypts authenticated data and binds it to the logical Redis key', () => {
    const keyring = parseKeyring(`redis-2:${current}`);
    const sealed = sealRedisValue(keyring, 'better-auth:session:1', 'sensitive-session');

    expect(sealed).not.toContain('sensitive-session');
    expect(openRedisValue(keyring, 'better-auth:session:1', sealed)).toBe('sensitive-session');
    expect(() => openRedisValue(keyring, 'better-auth:session:2', sealed)).toThrow();
  });

  it('reads old versions while new writes use the current key', () => {
    const oldKeyring = parseKeyring(`redis-1:${old}`);
    const rotatedKeyring = parseKeyring(`redis-2:${current},redis-1:${old}`);
    const oldValue = sealRedisValue(oldKeyring, 'verification:1', 'one-time-value');
    const newValue = sealRedisValue(rotatedKeyring, 'verification:1', 'new-value');

    expect(openRedisValue(rotatedKeyring, 'verification:1', oldValue)).toBe('one-time-value');
    expect(newValue.startsWith('v1:redis-2:')).toBe(true);
  });

  it('rejects tampered ciphertext and unknown key versions', () => {
    const keyring = parseKeyring(`redis-2:${current}`);
    const sealed = sealRedisValue(keyring, 'rate-limit:1', '5');
    const tampered = `${sealed.slice(0, -1)}${sealed.endsWith('A') ? 'B' : 'A'}`;

    expect(() => openRedisValue(keyring, 'rate-limit:1', tampered)).toThrow();
    expect(() => openRedisValue(parseKeyring(`redis-3:${old}`), 'rate-limit:1', sealed)).toThrow(
      /Unknown Redis encryption key version/
    );
  });
});
