# Authlane API Tests

This directory contains unit and integration tests for the Authlane API.

## Test Structure

```
tests/
├── unit/               # Unit tests (no database required)
│   ├── rate-limit.test.ts
│   └── tenant-context.test.ts
├── integration/        # Integration tests (require database)
│   ├── oauth-flow.test.ts
│   └── oauth-error-scenarios.test.ts
└── setup/             # Test configuration
    ├── setup.ts       # Global test setup
    ├── test-db.ts     # Database utilities
    ├── test-helpers.ts
    └── mock-redis.ts
```

## Running Tests

### Prerequisites

For integration tests, you need a PostgreSQL test database:

```bash
# Option 1: Use Docker (recommended)
docker run -d \
  --name authlane-test-db \
  -e POSTGRES_USER=test \
  -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=authlane_test \
  -p 5433:5432 \
  postgres:16

# Option 2: Use existing PostgreSQL
createuser -s test
createdb -O test authlane_test
```

### Environment Variables

Set test database URL:

```bash
export TEST_DATABASE_URL="postgresql://test:test@localhost:5433/authlane_test"
```

Or create `.env.test` file:

```
TEST_DATABASE_URL=postgresql://test:test@localhost:5433/authlane_test
TEST_REDIS_URL=redis://localhost:6379
```

### Run Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test oauth-flow

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

## Test Categories

### Unit Tests

Unit tests don't require database connections and test isolated logic:

- **rate-limit.test.ts**: Rate limiting middleware
- **tenant-context.test.ts**: Tenant context utilities

Run only unit tests:
```bash
pnpm test unit/
```

### Integration Tests

Integration tests require a PostgreSQL database and test the full OAuth flow:

- **oauth-flow.test.ts**: Complete OAuth authorization and callback flow
- **oauth-error-scenarios.test.ts**: Error handling and edge cases

Run only integration tests:
```bash
pnpm test integration/
```

## OAuth Flow Tests

The OAuth flow tests cover:

### Authorization Flow
- ✅ Initiate OAuth with PKCE code challenge
- ✅ Generate state parameter for CSRF protection
- ✅ Validate client_id and redirect_uri
- ✅ Create pending connection in database
- ✅ Use tenant-specific OAuth configuration

### Callback Flow
- ✅ Validate state parameter (CSRF protection)
- ✅ Exchange authorization code for tokens
- ✅ Verify PKCE code_verifier
- ✅ Encrypt and store credentials
- ✅ Update connection status to "connected"

### Credentials Management
- ✅ Encrypt credentials with AES-256-GCM
- ✅ Decrypt credentials for retrieval
- ✅ Don't expose credentials in list endpoints

### Error Scenarios
- ✅ Invalid state parameter (CSRF attack)
- ✅ Expired authorization code
- ✅ Missing PKCE verifier
- ✅ OAuth provider errors (access_denied, invalid_scope)
- ✅ Malformed parameters (SQL injection, XSS)
- ✅ Race conditions (multiple simultaneous authorizations)

## Database Setup

Before running integration tests for the first time:

```bash
# 1. Create test database
docker run -d --name authlane-test-db \
  -e POSTGRES_USER=test \
  -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=authlane_test \
  -p 5433:5432 postgres:16

# 2. Run migrations
export DATABASE_URL="postgresql://test:test@localhost:5433/authlane_test"
pnpm --filter @authlane/database db:migrate

# 3. Seed test data (optional)
pnpm --filter @authlane/database seed

# 4. Run tests
pnpm --filter @authlane/api test
```

## Test Utilities

### Test Database

```typescript
import { getTestDb, cleanDatabase } from '../setup/test-db';

const db = getTestDb();
await cleanDatabase(db); // Clean all tables between tests
```

### Test Helpers

```typescript
import { testTenantMiddleware } from '../setup/test-helpers';

app.use('*', testTenantMiddleware()); // Inject tenant context from header
```

## Continuous Integration

Tests run automatically on:
- Pull requests
- Commits to main branch
- Manual workflow dispatch

CI setup uses GitHub Actions with PostgreSQL service container.

## Coverage

Current coverage thresholds (defined in `vitest.config.ts`):
- Lines: 50%
- Functions: 50%
- Branches: 50%
- Statements: 50%

View coverage report:
```bash
pnpm test:coverage
open coverage/index.html
```

## Debugging Tests

### Verbose Mode

```bash
DEBUG=* pnpm test oauth-flow
```

### Single Test

```bash
pnpm test oauth-flow -t "should initiate OAuth flow"
```

### Debug in VS Code

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Tests",
  "runtimeExecutable": "pnpm",
  "runtimeArgs": ["test", "--run", "--reporter=verbose"],
  "console": "integratedTerminal",
  "env": {
    "TEST_DATABASE_URL": "postgresql://test:test@localhost:5433/authlane_test"
  }
}
```

## Writing New Tests

### Integration Test Template

```typescript
import { createApp } from '../../src/index.js';
import { cleanDatabase, getTestDb } from '../setup/test-db.js';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';

describe('My Feature', () => {
  const db = getTestDb();
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    app = createApp(db);
    // Setup test data
  });

  afterAll(async () => {
    await cleanDatabase(db);
  });

  it('should do something', async () => {
    const response = await app.request('/api/v1/endpoint', {
      headers: { Authorization: 'Bearer test_key' }
    });

    expect(response.status).toBe(200);
  });
});
```

## Troubleshooting

### "role test does not exist"

Create PostgreSQL user:
```bash
createuser -s test
# or
psql -c "CREATE USER test WITH SUPERUSER PASSWORD 'test';"
```

### "database authlane_test does not exist"

Create database:
```bash
createdb -O test authlane_test
# or
psql -c "CREATE DATABASE authlane_test OWNER test;"
```

### "TRUNCATE TABLE ... permission denied"

Grant permissions:
```bash
psql authlane_test -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO test;"
```

### Tests hang or timeout

Check database connection:
```bash
psql $TEST_DATABASE_URL -c "SELECT 1;"
```

Increase test timeout in `vitest.config.ts`:
```typescript
testTimeout: 30000, // 30 seconds
```

## Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Always clean database in `afterEach` or `afterAll`
3. **Realistic Data**: Use realistic test data, not foo/bar
4. **Edge Cases**: Test error scenarios, not just happy paths
5. **Security**: Test CSRF, SQL injection, XSS prevention
6. **Performance**: Integration tests should complete in < 10s

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Hono Testing Guide](https://hono.dev/guides/testing)
- [Drizzle ORM Testing](https://orm.drizzle.team/docs/testing)

---

**Last Updated:** November 27, 2025
