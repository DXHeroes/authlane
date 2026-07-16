import { afterEach, describe, expect, it } from 'vitest';
import { getEnv } from '../src/env.js';

const originalEnv = { ...process.env };
const ring = (id: string, byte: string) => `${id}:${byte.repeat(64)}`;

function setValidEnvironment() {
  process.env.DATABASE_URL = 'postgresql://authlane:test@localhost:5432/authlane';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.AUTHLANE_DATA_KEK_RING = ring('data-v1', '1');
  process.env.AUTHLANE_LOOKUP_KEY_RING = ring('lookup-v1', '2');
  process.env.AUTHLANE_REDIS_KEY_RING = ring('redis-v1', '3');
  process.env.BETTER_AUTH_SECRETS = `2:${'a'.repeat(32)},1:${'b'.repeat(32)}`;
  process.env.BETTER_AUTH_URL = 'https://api.authlane.test';
  process.env.CORS_ORIGIN = 'https://dashboard.authlane.test';
  delete process.env.ENCRYPTION_KEY;
}

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('security environment validation', () => {
  it('accepts versioned keyrings and never returns raw key material in the config object', () => {
    setValidEnvironment();

    const env = getEnv();

    expect(env.AUTHLANE_DATA_KEK_RING).toBe(process.env.AUTHLANE_DATA_KEK_RING);
    expect(env).not.toHaveProperty('ENCRYPTION_KEY');
  });

  it('rejects the legacy singleton encryption key', () => {
    setValidEnvironment();
    process.env.ENCRYPTION_KEY = 'ab'.repeat(32);

    expect(() => getEnv()).toThrow(/ENCRYPTION_KEY is no longer supported/);
  });

  it('requires Redis in production', () => {
    setValidEnvironment();
    process.env.NODE_ENV = 'production';
    delete process.env.REDIS_URL;

    expect(() => getEnv()).toThrow(/REDIS_URL is required in production/);
  });

  it('requires rotated auth secrets and HTTPS origins in production', () => {
    setValidEnvironment();
    process.env.NODE_ENV = 'production';
    delete process.env.BETTER_AUTH_SECRETS;
    expect(() => getEnv()).toThrow(/BETTER_AUTH_SECRETS/);

    process.env.BETTER_AUTH_SECRETS = `1:${'a'.repeat(32)}`;
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    expect(() => getEnv()).toThrow(/CORS_ORIGIN/);
  });

  it('rejects malformed or unversioned keyrings', () => {
    setValidEnvironment();
    process.env.AUTHLANE_LOOKUP_KEY_RING = 'not-versioned';

    expect(() => getEnv()).toThrow(/AUTHLANE_LOOKUP_KEY_RING/);
  });
});
