# Contributing Guide

Guidelines for contributing to Authlane.

## Getting Started

1. Fork the repository
2. Clone your fork
3. Set up development environment (see [Setup Guide](./setup.md))
4. Create a feature branch

## Development Workflow

### 1. Create Branch

```bash
git checkout -b feature/my-feature
# or
git checkout -b fix/bug-description
```

Branch naming conventions:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation
- `refactor/` - Code refactoring
- `test/` - Test additions

### 2. Make Changes

- Follow the [Code Style](./code-style.md) guidelines
- Add tests for new functionality
- Update documentation as needed

### 3. Run Checks

```bash
# Run all checks
pnpm lint
pnpm typecheck
pnpm test
```

### 4. Commit Changes

Follow [Conventional Commits](https://conventionalcommits.org/):

```bash
git commit -m "feat: add new GitHub tool"
git commit -m "fix: handle expired tokens correctly"
git commit -m "docs: update API reference"
```

Commit types:
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting
- `refactor` - Code restructuring
- `test` - Adding tests
- `chore` - Maintenance

### 5. Push and Create PR

```bash
git push origin feature/my-feature
```

Then create a Pull Request on GitHub.

## Pull Request Guidelines

### PR Title

Use conventional commit format:
```
feat: add Notion integration
fix: resolve OAuth state validation bug
docs: improve SDK examples
```

### PR Description

Include:
- What changes were made
- Why the changes are needed
- How to test the changes
- Screenshots (if UI changes)

### PR Checklist

- [ ] Tests pass locally
- [ ] Linting passes
- [ ] Types check
- [ ] Documentation updated
- [ ] Changelog entry added (if applicable)

## Code Review

### What We Look For

1. **Correctness**: Does it work as intended?
2. **Security**: No vulnerabilities introduced?
3. **Performance**: No obvious performance issues?
4. **Style**: Follows code style guidelines?
5. **Tests**: Adequate test coverage?
6. **Documentation**: Clear and complete?

### Responding to Feedback

- Address all comments
- Explain your reasoning if you disagree
- Push fixes as new commits (don't force-push during review)
- Request re-review when ready

## Adding Integrations

### 1. Create Integration Directory

```bash
mkdir -p integrations/my-service
```

### 2. Create config.yaml

```yaml
id: my-service
name: My Service
auth_type: oauth2
config:
  authorization_url: https://my-service.com/oauth/authorize
  token_url: https://my-service.com/oauth/token
  scopes:
    - read
    - write
  default_scopes:
    - read
```

### 3. Create Tools

```typescript
// integrations/my-service/tools.ts
import { defineTool } from '@authlane/core';

export const myServiceListItems = defineTool({
  name: 'my_service_list_items',
  description: 'List items from My Service',
  parameters: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum items to return',
      },
    },
  },
  execute: async ({ credentials, parameters }) => {
    const response = await fetch('https://api.my-service.com/items', {
      headers: {
        Authorization: `Bearer ${credentials.access_token}`,
      },
    });
    return response.json();
  },
});
```

### 4. Add Tests

```typescript
// integrations/my-service/tools.test.ts
import { describe, it, expect } from 'vitest';
import { myServiceListItems } from './tools';

describe('my-service tools', () => {
  it('lists items', async () => {
    const result = await myServiceListItems.execute({
      credentials: { access_token: 'test' },
      parameters: { limit: 10 },
    });
    expect(result).toBeDefined();
  });
});
```

### 5. Document

Create `integrations/my-service/README.md` with:
- Service overview
- Required scopes
- Available tools
- Setup instructions

## Adding API Endpoints

### 1. Create Route File

```typescript
// apps/api/src/routes/my-route.ts
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';

const app = new Hono();

app.get('/', authMiddleware, async (c) => {
  // Implementation
  return c.json({ data: result });
});

export default app;
```

### 2. Register Route

```typescript
// apps/api/src/index.ts
import myRoute from './routes/my-route';

app.route('/v1/my-route', myRoute);
```

### 3. Add Tests

```typescript
// apps/api/src/routes/my-route.test.ts
import { describe, it, expect } from 'vitest';
import app from '../index';

describe('GET /v1/my-route', () => {
  it('returns data', async () => {
    const res = await app.request('/v1/my-route', {
      headers: { 'X-API-Key': 'test-key' },
    });
    expect(res.status).toBe(200);
  });
});
```

## Database Changes

### 1. Modify Schema

```typescript
// packages/database/src/schema/my-table.ts
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const myTable = pgTable('my_table', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
```

### 2. Generate Migration

```bash
pnpm db:generate
```

### 3. Review Migration

Check `packages/database/src/migrations/` for the generated SQL.

### 4. Apply Migration

```bash
pnpm db:migrate
```

## Release Process

1. Update version in package.json files
2. Update CHANGELOG.md
3. Create release PR
4. After merge, tag release
5. CI/CD handles publishing

## Getting Help

- **Discord**: [Community Discord](https://discord.gg/authlane)
- **GitHub Discussions**: For questions and ideas
- **GitHub Issues**: For bugs and feature requests

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Help others learn
- Follow project guidelines

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (MIT License).
