/**
 * Global test setup
 * Runs before all tests
 */

import { beforeAll, afterAll } from 'vitest';

// Mock environment variables for tests
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/authlane_test';
  process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379';
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // Test key (64 hex chars)
  process.env.API_KEY_HASH = '$2a$10$test.hash.for.testing.purposes';
  process.env.API_PORT = '3001';
  process.env.API_HOST = 'localhost';
  process.env.CORS_ORIGIN = 'http://localhost:3000';
  process.env.RATE_LIMIT_ENABLED = 'true';
  process.env.RATE_LIMIT_MAX_REQUESTS = '100';
  process.env.RATE_LIMIT_WINDOW_MS = '60000';
});

afterAll(() => {
  // Cleanup if needed
});
