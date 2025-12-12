# Migrations

Database migration guide and procedures for Authlane.

## Overview

Authlane uses Drizzle Kit for database migrations. Migrations are generated from schema changes and applied sequentially.

## Migration Files

Migrations are stored in:
```
packages/database/drizzle/
├── 0000_polite_rawhide_kid.sql    # Initial schema
├── 0001_polite_bloodaxe.sql       # Organization services updates
└── meta/
    └── _journal.json              # Migration journal
```

## Commands

### Generate Migration

After modifying schema files, generate a migration:

```bash
# From project root
pnpm --filter @authlane/database generate

# Or from packages/database
cd packages/database
pnpm generate
```

This creates a new SQL file in `drizzle/` based on schema changes.

### Run Migrations

Apply pending migrations to the database:

```bash
# From project root
pnpm --filter @authlane/database migrate

# Or from packages/database
pnpm migrate
```

### View Migration Status

Check which migrations have been applied:

```bash
pnpm --filter @authlane/database studio
```

This opens Drizzle Studio where you can inspect the database.

### Push (Development Only)

For rapid development, push schema directly without migrations:

```bash
pnpm --filter @authlane/database push
```

**Warning:** Only use `push` in development. Always use migrations in production.

## Drizzle Configuration

```typescript
// packages/database/drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
```

## Migration Workflow

### Development

1. Modify schema in `packages/database/src/schema/`
2. Run `pnpm --filter @authlane/database generate`
3. Review generated SQL in `drizzle/`
4. Run `pnpm --filter @authlane/database migrate`
5. Commit both schema changes and migration files

### Production

1. Deploy new code (includes migration files)
2. Run migrations before starting the application:
   ```bash
   pnpm --filter @authlane/database migrate
   ```
3. Start the application

### Rollback

Drizzle Kit doesn't have built-in rollback. To rollback:

1. Create a new migration that reverses the changes
2. Or restore from backup

```bash
# Example: Generate rollback migration
# (After manually reverting schema changes)
pnpm --filter @authlane/database generate
```

## Initial Schema Migration

The initial migration (`0000_polite_rawhide_kid.sql`) creates:

```sql
-- Core auth tables
CREATE TABLE "user" (...);
CREATE TABLE "session" (...);
CREATE TABLE "account" (...);
CREATE TABLE "verification" (...);

-- Organization tables
CREATE TABLE "organization" (...);
CREATE TABLE "member" (...);
CREATE TABLE "invitation" (...);

-- Integration tables
CREATE TABLE "services" (...);
CREATE TABLE "organization_services" (...);
CREATE TABLE "connections" (...);

-- Enums
CREATE TYPE "connection_scope" AS ENUM ('user', 'organization');

-- Indexes and constraints
...
```

## Seeding

Seed the database with initial data:

```bash
pnpm --filter @authlane/database seed
```

Seed script creates:
- Default services (GitHub, Slack, etc.)
- Test organization (development only)
- Test API key (development only)

```typescript
// packages/database/src/seed.ts
export async function seed() {
  // Insert default services
  await db.insert(services).values([
    {
      id: 'github',
      name: 'GitHub',
      authType: 'oauth2',
      config: {
        authorization_url: 'https://github.com/login/oauth/authorize',
        token_url: 'https://github.com/login/oauth/access_token',
        scopes: ['repo', 'user'],
      },
      enabled: true,
    },
    // ... more services
  ]);
}
```

## Best Practices

### 1. Review Generated Migrations

Always review the generated SQL before applying:

```bash
# Generate and review
pnpm --filter @authlane/database generate
cat packages/database/drizzle/[latest].sql
```

### 2. Test Migrations

Test migrations in a staging environment before production:

```bash
# Use a test database
DATABASE_URL=postgres://...test... pnpm --filter @authlane/database migrate
```

### 3. Backup Before Migrating

Always backup production database before migrations:

```bash
pg_dump -Fc $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).dump
```

### 4. Atomic Migrations

Keep migrations small and atomic. Each migration should:
- Do one thing
- Be reversible (conceptually)
- Not depend on application code

### 5. Handle Data Migrations

For data migrations, create a separate script:

```typescript
// scripts/migrate-data.ts
async function migrateData() {
  // Data transformation logic
  await db.update(connections)
    .set({ status: 'connected' })
    .where(eq(connections.status, 'active'));
}
```

## Troubleshooting

### Migration Failed

If a migration fails:

1. Check the error message
2. Fix the issue in the schema
3. Generate a new migration with the fix
4. Or manually fix the database and mark migration as applied

### Schema Drift

If the database differs from the schema:

```bash
# Check for differences
pnpm --filter @authlane/database check

# Pull current schema from database
pnpm --filter @authlane/database introspect
```

### Reset Database (Development)

To reset the development database:

```bash
# Drop and recreate
docker-compose down -v
docker-compose up -d
pnpm --filter @authlane/database migrate
pnpm --filter @authlane/database seed
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |

Example:
```
DATABASE_URL=postgresql://authlane:password@localhost:5432/authlane
```

## CI/CD Integration

### GitHub Actions Example

```yaml
jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: pnpm install

      - name: Run migrations
        run: pnpm --filter @authlane/database migrate
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

### Pre-deployment Check

```bash
#!/bin/bash
# scripts/pre-deploy.sh

# Check for pending migrations
PENDING=$(pnpm --filter @authlane/database check 2>&1)
if [[ $PENDING == *"No changes"* ]]; then
  echo "No pending migrations"
else
  echo "Pending migrations detected!"
  echo "$PENDING"
  exit 1
fi
```
