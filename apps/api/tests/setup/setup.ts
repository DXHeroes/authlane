/**
 * Global test setup
 * Runs before all tests
 */

import { afterAll, beforeAll } from 'vitest';

// Mock environment variables for tests
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  // A DATABASE_URL already in the environment wins over the placeholder, so the suites that drive
  // a real database (the OAuth provider flow) run against whatever CI or a developer provisioned.
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgresql://test:test@localhost:5432/authlane_test';
  process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379';
  process.env.AUTHLANE_DATA_KEK_RING = `test-kek:${'01'.repeat(32)}`;
  process.env.AUTHLANE_LOOKUP_KEY_RING = `test-lookup:${'02'.repeat(32)}`;
  process.env.AUTHLANE_REDIS_KEY_RING = `test-redis:${'03'.repeat(32)}`;
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
