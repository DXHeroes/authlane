/**
 * Environment variable validation and types
 */

interface Env {
  DATABASE_URL: string;
  REDIS_URL?: string;
  ENCRYPTION_KEY: string;
  API_PORT?: number;
  API_HOST?: string;
  NODE_ENV?: string;
  CORS_ORIGIN?: string;
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

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required. Generate with: openssl rand -hex 32'
    );
  }

  if (encryptionKey.length !== 64) {
    throw new Error(
      `ENCRYPTION_KEY must be 64 hex characters (32 bytes). Got ${encryptionKey.length} characters.`
    );
  }

  return {
    DATABASE_URL: databaseUrl,
    REDIS_URL: process.env.REDIS_URL,
    ENCRYPTION_KEY: encryptionKey,
    API_PORT: process.env.API_PORT ? Number(process.env.API_PORT) : 3000,
    API_HOST: process.env.API_HOST || '0.0.0.0',
    NODE_ENV: process.env.NODE_ENV || 'development',
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
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
