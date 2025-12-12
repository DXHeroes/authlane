# Development Documentation

Guide for contributing to and developing Authlane.

## Contents

- [Development Setup](./setup.md) - Local development environment
- [Contributing](./contributing.md) - Contribution guidelines
- [Testing](./testing.md) - Testing strategy and guides
- [Code Style](./code-style.md) - Coding standards

## Quick Setup

### Prerequisites

- Node.js 22+
- pnpm 9+
- Docker and Docker Compose
- PostgreSQL 16+ (or use Docker)
- Redis 7+ (or use Docker)

### 1. Clone Repository

```bash
git clone https://github.com/authlane/authlane.git
cd authlane
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Start Infrastructure

```bash
docker compose -f docker/docker-compose.yml up -d
```

### 4. Configure Environment

```bash
cp .env.example .env
```

### 5. Run Migrations

```bash
pnpm db:migrate
```

### 6. Start Development Server

```bash
pnpm dev
```

## Project Structure

```
authlane/
├── apps/
│   ├── api/               # Hono API server
│   ├── dashboard/         # React dashboard
│   ├── landing/           # Landing page
│   └── example-saas/      # Example integration
│
├── packages/
│   ├── database/          # Drizzle schema & client
│   ├── crypto/            # Encryption utilities
│   ├── email/             # Email templates
│   ├── shared/            # Shared types & utilities
│   └── sdk/               # TypeScript SDK
│
├── integrations/          # Service integrations
│   ├── github/
│   ├── slack/
│   └── ...
│
├── docker/                # Docker configurations
├── scripts/               # Development scripts
└── e2e/                   # End-to-end tests
```

## Development Commands

```bash
# Start all apps in development
pnpm dev

# Start specific app
pnpm --filter api dev
pnpm --filter dashboard dev

# Run tests
pnpm test

# Run linting
pnpm lint

# Run type checking
pnpm typecheck

# Database commands
pnpm db:generate  # Generate migrations
pnpm db:migrate   # Run migrations
pnpm db:push      # Push schema changes
pnpm db:studio    # Open Drizzle Studio

# Build all packages
pnpm build
```

## Development Workflow

### 1. Create Branch

```bash
git checkout -b feature/my-feature
```

### 2. Make Changes

Follow the code style guidelines and add tests.

### 3. Run Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
```

### 4. Commit

```bash
git add .
git commit -m "feat: add new feature"
```

Follow [Conventional Commits](https://conventionalcommits.org/).

### 5. Push and Create PR

```bash
git push origin feature/my-feature
```

## Architecture Decisions

Key architecture decisions are documented in [ADRs](../appendices/adr/).

### Tech Stack

| Layer | Technology |
|-------|------------|
| API Framework | Hono |
| Database | PostgreSQL + Drizzle ORM |
| Cache | Redis |
| Queue | BullMQ |
| Frontend | React 19 + Vite |
| Styling | Tailwind CSS |
| Monorepo | Turborepo + pnpm |

### Design Principles

1. **Type Safety**: Full TypeScript with strict mode
2. **Security First**: Encryption, RLS, secure defaults
3. **Developer Experience**: Good docs, clear APIs
4. **Modularity**: Packages and integrations are independent

## Code Style

### TypeScript

```typescript
// Use explicit types for function parameters
function createUser(name: string, email: string): Promise<User> {
  // ...
}

// Use interfaces for objects
interface CreateUserParams {
  name: string;
  email: string;
}

// Use const for immutable values
const MAX_RETRIES = 3;
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `auth-context.ts` |
| Functions | camelCase | `createUser()` |
| Classes | PascalCase | `AuthService` |
| Constants | SCREAMING_CASE | `MAX_RETRIES` |
| Types | PascalCase | `UserProfile` |

### Error Handling

```typescript
// Always return { data, error } pattern
async function doSomething(): Promise<{ data: T | null; error: Error | null }> {
  try {
    const result = await operation();
    return { data: result, error: null };
  } catch (error) {
    return { data: null, error };
  }
}
```

## Testing

### Unit Tests

```bash
pnpm test
```

### E2E Tests

```bash
pnpm test:e2e
```

### Test Coverage

```bash
pnpm test:coverage
```

## Getting Help

- **Discord**: [Community Discord](https://discord.gg/authlane)
- **GitHub Issues**: Bug reports and features
- **Discussions**: Questions and ideas

