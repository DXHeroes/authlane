# Development Setup

Set up your local development environment for Authlane.

## Prerequisites

- **Node.js**: 22+ (use nvm for version management)
- **pnpm**: 9+ (package manager)
- **Docker**: 20.10+ (for PostgreSQL and Redis)
- **Git**: Latest version

## Quick Setup

### 1. Clone Repository

```bash
git clone https://github.com/authlane/authlane.git
cd authlane
```

### 2. Install Node.js

Using nvm:
```bash
nvm install
nvm use
# Or check required version
cat .node-version
```

### 3. Install pnpm

```bash
npm install -g pnpm@9
```

### 4. Install Dependencies

```bash
pnpm install
```

### 5. Start Infrastructure

```bash
docker compose -f docker/docker-compose.yml up -d
```

This starts:
- PostgreSQL on port 5432
- Redis on port 6379

### 6. Configure Environment

```bash
cp .env.example .env
```

Default `.env` for development:
```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/authlane

# Redis
REDIS_URL=redis://localhost:6379

# Encryption (generate for dev)
ENCRYPTION_KEY=K7gNU3sdo+OL0wNhqoVWhr3g6s1xYv72ol/pe/Unols=

# Development settings
NODE_ENV=development
LOG_LEVEL=debug
PORT=3000
```

### 7. Run Migrations

```bash
pnpm db:migrate
```

### 8. Start Development Server

```bash
pnpm dev
```

Services start on:
- API: http://localhost:3000
- Dashboard: http://localhost:3001
- Example SaaS: http://localhost:3002

## IDE Setup

### VS Code

Recommended extensions:
- **ESLint**: Linting
- **Prettier**: Code formatting
- **Tailwind CSS IntelliSense**: Tailwind autocomplete
- **Prisma/Drizzle**: Schema highlighting

Settings (`.vscode/settings.json`):
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

### WebStorm / IntelliJ

1. Enable ESLint: Settings → Languages → JavaScript → Code Quality Tools → ESLint
2. Enable Prettier: Settings → Languages → JavaScript → Prettier
3. Enable auto-format on save

## Project Structure

```
authlane/
├── apps/
│   ├── api/               # Hono API server
│   │   ├── src/
│   │   │   ├── routes/    # API routes
│   │   │   ├── middleware/# Middleware
│   │   │   └── index.ts   # Entry point
│   │   └── package.json
│   │
│   ├── dashboard/         # React dashboard
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   └── App.tsx
│   │   └── package.json
│   │
│   └── example-saas/      # Example integration
│
├── packages/
│   ├── database/          # Drizzle schema & migrations
│   │   ├── src/
│   │   │   ├── schema/    # Table definitions
│   │   │   └── client.ts  # Database client
│   │   └── drizzle.config.mjs
│   │
│   ├── crypto/            # Encryption utilities
│   ├── email/             # Email templates
│   ├── shared/            # Shared types
│   └── sdk/               # TypeScript SDK
│
├── integrations/          # Service integrations
│   ├── github/
│   │   ├── config.yaml    # OAuth configuration
│   │   ├── tools.ts       # Tool definitions
│   │   └── index.ts       # Integration entry
│   └── .../
│
├── docker/                # Docker configs
├── scripts/               # Development scripts
├── e2e/                   # End-to-end tests
├── turbo.json             # Turborepo config
└── package.json           # Root package.json
```

## Development Commands

### Running Apps

```bash
# All apps
pnpm dev

# Specific app
pnpm --filter api dev
pnpm --filter dashboard dev
pnpm --filter example-saas dev
```

### Database

```bash
# Generate migration from schema changes
pnpm db:generate

# Run pending migrations
pnpm db:migrate

# Push schema without migrations (dev only)
pnpm db:push

# Open Drizzle Studio (GUI)
pnpm db:studio
```

### Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run specific package tests
pnpm --filter api test

# Run E2E tests
pnpm test:e2e

# Run with coverage
pnpm test:coverage
```

### Linting & Formatting

```bash
# Run ESLint
pnpm lint

# Fix ESLint issues
pnpm lint:fix

# Run type checking
pnpm typecheck

# Format code
pnpm format
```

### Building

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter api build
```

## Working with Packages

### Add Dependency

```bash
# To root
pnpm add -w package-name

# To specific package
pnpm --filter api add package-name

# Dev dependency
pnpm --filter api add -D package-name
```

### Internal Dependencies

Reference internal packages in `package.json`:
```json
{
  "dependencies": {
    "@authlane/database": "workspace:*",
    "@authlane/shared": "workspace:*"
  }
}
```

## Testing OAuth Locally

### Using ngrok

```bash
# Install ngrok
brew install ngrok

# Expose local API
ngrok http 3000
```

Update OAuth app callback URL to ngrok URL.

### Using localhost.run

```bash
ssh -R 80:localhost:3000 nokey@localhost.run
```

## Database Tools

### Drizzle Studio

```bash
pnpm db:studio
```

Opens GUI at http://localhost:4983

### Direct PostgreSQL Access

```bash
# Using psql
psql $DATABASE_URL

# Using Docker
docker compose exec db psql -U postgres authlane
```

### View Tables

```sql
-- List tables
\dt

-- View schema
\d connections

-- Query data
SELECT * FROM connections LIMIT 10;
```

## Troubleshooting

### Port Already in Use

```bash
# Find process
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Database Connection Issues

```bash
# Check Docker is running
docker compose ps

# Restart database
docker compose restart db

# Check logs
docker compose logs db
```

### Node Modules Issues

```bash
# Clean install
rm -rf node_modules
pnpm install

# Clear cache
pnpm store prune
```

### TypeScript Errors

```bash
# Rebuild packages
pnpm build

# Check types
pnpm typecheck
```

## Next Steps

- [Contributing Guide](./contributing.md)
- [Testing Guide](./testing.md)
- [Code Style](./code-style.md)

