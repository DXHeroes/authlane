# Testing Guide

Testing strategy and guides for Authlane.

## Overview

Authlane uses a multi-layered testing approach:

| Layer | Tool | Purpose |
|-------|------|---------|
| Unit | Vitest | Test individual functions |
| Integration | Vitest | Test component interactions |
| E2E | Playwright | Test full user flows |

## Running Tests

```bash
# All tests
pnpm test

# Watch mode
pnpm test:watch

# Specific package
pnpm --filter api test
pnpm --filter database test

# E2E tests
pnpm test:e2e

# Coverage report
pnpm test:coverage
```

## Unit Tests

### Structure

```typescript
// packages/crypto/src/index.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { encrypt, decrypt } from './index';

describe('encryption', () => {
  const key = Buffer.from('test-key-32-bytes-long-exactly!!');

  describe('encrypt', () => {
    it('encrypts plaintext', () => {
      const result = encrypt('secret', key);

      expect(result.ciphertext).toBeDefined();
      expect(result.iv).toBeDefined();
      expect(result.authTag).toBeDefined();
    });

    it('produces different output for same input', () => {
      const result1 = encrypt('secret', key);
      const result2 = encrypt('secret', key);

      expect(result1.ciphertext).not.toBe(result2.ciphertext);
    });
  });

  describe('decrypt', () => {
    it('decrypts encrypted data', () => {
      const encrypted = encrypt('secret', key);
      const decrypted = decrypt(encrypted, key);

      expect(decrypted).toBe('secret');
    });

    it('throws on tampered data', () => {
      const encrypted = encrypt('secret', key);
      encrypted.ciphertext = 'tampered';

      expect(() => decrypt(encrypted, key)).toThrow();
    });
  });
});
```

### Best Practices

1. **Test behavior, not implementation**
2. **Use descriptive test names**
3. **One assertion per test when possible**
4. **Isolate tests** - no shared mutable state

## Integration Tests

### API Route Tests

```typescript
// apps/api/src/routes/services.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testClient } from 'hono/testing';
import app from '../index';
import { db } from '@authlane/database';

describe('GET /v1/services', () => {
  beforeAll(async () => {
    // Seed test data
    await db.services.create({
      id: 'test-service',
      name: 'Test Service',
      authType: 'oauth2',
    });
  });

  afterAll(async () => {
    // Cleanup
    await db.services.delete({ id: 'test-service' });
  });

  it('returns list of services', async () => {
    const res = await testClient(app).services.$get({
      header: { 'X-API-Key': 'test-api-key' },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toBeInstanceOf(Array);
  });

  it('requires authentication', async () => {
    const res = await testClient(app).services.$get();

    expect(res.status).toBe(401);
  });
});
```

### Database Tests

```typescript
// packages/database/src/client.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './client';
import { connections } from './schema';

describe('connections', () => {
  beforeEach(async () => {
    // Clear test data
    await db.delete(connections).where(/* test org */);
  });

  it('creates connection', async () => {
    const result = await db.insert(connections).values({
      organizationId: 'test-org',
      externalUserId: 'user-1',
      serviceId: 'github',
      status: 'pending',
    }).returning();

    expect(result[0].id).toBeDefined();
  });

  it('enforces unique constraint', async () => {
    await db.insert(connections).values({
      organizationId: 'test-org',
      externalUserId: 'user-1',
      serviceId: 'github',
      status: 'pending',
    });

    await expect(
      db.insert(connections).values({
        organizationId: 'test-org',
        externalUserId: 'user-1',
        serviceId: 'github',
        status: 'pending',
      })
    ).rejects.toThrow();
  });
});
```

## E2E Tests

### Setup

```typescript
// e2e/utils.ts
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  authenticatedPage: async ({ page }, use) => {
    // Login before test
    await page.goto('/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');

    await use(page);
  },
});

export { expect };
```

### Test Examples

```typescript
// e2e/services.spec.ts
import { test, expect } from './utils';

test.describe('Services Page', () => {
  test('lists available services', async ({ authenticatedPage: page }) => {
    await page.goto('/services');

    await expect(page.getByText('GitHub')).toBeVisible();
    await expect(page.getByText('Slack')).toBeVisible();
  });

  test('configures service', async ({ authenticatedPage: page }) => {
    await page.goto('/services');
    await page.click('text=GitHub');
    await page.click('text=Configure');

    await page.fill('[name="clientId"]', 'test-client-id');
    await page.fill('[name="clientSecret"]', 'test-secret');
    await page.click('text=Save');

    await expect(page.getByText('Configuration saved')).toBeVisible();
  });
});
```

### OAuth Flow Test

```typescript
// e2e/oauth.spec.ts
import { test, expect } from './utils';

test.describe('OAuth Flow', () => {
  test('completes GitHub OAuth', async ({ authenticatedPage: page }) => {
    await page.goto('/connect/github');

    // Should redirect to GitHub
    await page.waitForURL(/github\.com\/login\/oauth/);

    // Mock: In real tests, handle OAuth callback
    // For E2E, use a test OAuth app or mock server
  });
});
```

## Mocking

### HTTP Requests

```typescript
import { vi } from 'vitest';

vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));

import fetch from 'node-fetch';

describe('GitHub tool', () => {
  it('creates issue', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1, html_url: 'https://...' }),
    });

    const result = await createIssue({
      credentials: { access_token: 'token' },
      parameters: { owner: 'test', repo: 'test', title: 'Test' },
    });

    expect(result.id).toBe(1);
  });
});
```

### Database

```typescript
import { vi } from 'vitest';

// Mock the entire database module
vi.mock('@authlane/database', () => ({
  db: {
    connections: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));
```

### Redis

```typescript
import { vi } from 'vitest';
import { Redis } from 'ioredis';

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  })),
}));
```

## Test Data

### Fixtures

```typescript
// tests/fixtures/connections.ts
export const mockConnection = {
  id: 'conn-1',
  organizationId: 'org-1',
  externalUserId: 'user-1',
  serviceId: 'github',
  status: 'connected',
  credentialsEnc: 'encrypted-data',
  connectedAt: new Date('2025-01-01'),
};

export const mockConnections = [
  mockConnection,
  { ...mockConnection, id: 'conn-2', serviceId: 'slack' },
];
```

### Factories

```typescript
// tests/factories/user.ts
import { faker } from '@faker-js/faker';

export function createUser(overrides = {}) {
  return {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    name: faker.person.fullName(),
    ...overrides,
  };
}

export function createConnection(overrides = {}) {
  return {
    id: faker.string.uuid(),
    organizationId: faker.string.uuid(),
    externalUserId: faker.string.uuid(),
    serviceId: 'github',
    status: 'connected',
    ...overrides,
  };
}
```

## Coverage

### Generate Report

```bash
pnpm test:coverage
```

### Coverage Thresholds

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['**/node_modules/**', '**/dist/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
```

## CI Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
      redis:
        image: redis:7
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install
      - run: pnpm db:migrate
      - run: pnpm test:coverage
      - run: pnpm test:e2e

      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

## Next Steps

- [Code Style Guide](./code-style.md)
- [Contributing Guide](./contributing.md)
- [Development Setup](./setup.md)

