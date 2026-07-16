/**
 * Environment variable validation and types
 */

interface Env {
  DATABASE_URL: string;
  SYSTEM_DATABASE_URL?: string;
  REDIS_URL?: string;
  AUTHLANE_DATA_KEK_RING: string;
  AUTHLANE_LOOKUP_KEY_RING: string;
  AUTHLANE_REDIS_KEY_RING: string;
  API_PORT?: number;
  API_HOST?: string;
  NODE_ENV?: string;
  CORS_ORIGIN?: string;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_SECRETS?: string;
  RATE_LIMIT_ENABLED?: boolean;
  RATE_LIMIT_MAX_REQUESTS?: number;
  RATE_LIMIT_WINDOW_MS?: number;
  LOG_LEVEL?: string;
}

/**
 * Validates and returns environment variables
 */
export function getEnv(): Env {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  if (process.env.ENCRYPTION_KEY) {
    throw new Error(
      'ENCRYPTION_KEY is no longer supported. Configure the versioned Authlane keyrings instead.'
    );
  }
  const keyringNames = [
    'AUTHLANE_DATA_KEK_RING',
    'AUTHLANE_LOOKUP_KEY_RING',
    'AUTHLANE_REDIS_KEY_RING',
  ] as const;
  const keyrings = Object.fromEntries(
    keyringNames.map((name) => {
      const value = process.env[name];
      if (!value || !isValidKeyring(value)) {
        throw new Error(
          `${name} must contain comma-separated key-id:64-hex-key entries with the current key first`
        );
      }
      return [name, value];
    })
  ) as Record<(typeof keyringNames)[number], string>;
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (nodeEnv === 'production' && !process.env.REDIS_URL) {
    throw new Error('REDIS_URL is required in production');
  }
  if (nodeEnv === 'production' && !process.env.SYSTEM_DATABASE_URL) {
    throw new Error(
      'SYSTEM_DATABASE_URL is required for isolated background workers in production'
    );
  }
  if (nodeEnv === 'production') {
    if (!process.env.BETTER_AUTH_SECRETS || !isValidAuthSecrets(process.env.BETTER_AUTH_SECRETS)) {
      throw new Error(
        'BETTER_AUTH_SECRETS must contain version:secret entries of at least 32 characters in production'
      );
    }
    if (!process.env.BETTER_AUTH_URL || !isExactHttpsOrigin(process.env.BETTER_AUTH_URL)) {
      throw new Error('BETTER_AUTH_URL must be an exact HTTPS origin in production');
    }
    const corsOrigins = process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()) ?? [];
    if (corsOrigins.length === 0 || corsOrigins.some((origin) => !isExactHttpsOrigin(origin))) {
      throw new Error('CORS_ORIGIN must contain exact HTTPS origins in production');
    }
  }

  return {
    DATABASE_URL: databaseUrl,
    SYSTEM_DATABASE_URL: process.env.SYSTEM_DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    ...keyrings,
    API_PORT: process.env.API_PORT ? Number(process.env.API_PORT) : 3000,
    API_HOST: process.env.API_HOST || '0.0.0.0',
    NODE_ENV: nodeEnv,
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:5173',
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    BETTER_AUTH_SECRETS: process.env.BETTER_AUTH_SECRETS,
    RATE_LIMIT_ENABLED: process.env.RATE_LIMIT_ENABLED !== 'false',
    RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS
      ? Number(process.env.RATE_LIMIT_MAX_REQUESTS)
      : 100,
    RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS
      ? Number(process.env.RATE_LIMIT_WINDOW_MS)
      : 60000,
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  };
}

function isValidAuthSecrets(value: string): boolean {
  const versions = new Set<string>();
  return value.split(',').every((entry) => {
    const separator = entry.indexOf(':');
    const version = entry.slice(0, separator);
    const secret = entry.slice(separator + 1);
    if (!/^\d+$/.test(version) || secret.length < 32 || versions.has(version)) return false;
    versions.add(version);
    return true;
  });
}

function isExactHttpsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isValidKeyring(value: string): boolean {
  const seen = new Set<string>();
  const entries = value.split(',');
  if (entries.length === 0) return false;
  return entries.every((entry) => {
    const separator = entry.indexOf(':');
    const keyId = entry.slice(0, separator);
    const key = entry.slice(separator + 1);
    if (
      separator <= 0 ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(keyId) ||
      !/^[0-9a-fA-F]{64}$/.test(key) ||
      seen.has(keyId)
    ) {
      return false;
    }
    seen.add(keyId);
    return true;
  });
}
