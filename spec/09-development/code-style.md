# Code Style Guide

Coding standards and conventions for Authlane.

## TypeScript

### General Rules

- Use TypeScript strict mode
- Prefer explicit types over inference for function parameters
- Use `const` by default, `let` when reassignment is needed
- Never use `var`
- Never use `any` (use `unknown` if needed)

### Type Definitions

```typescript
// Good - explicit interface
interface User {
  id: string;
  email: string;
  name: string;
}

// Good - function with explicit types
function createUser(params: CreateUserParams): Promise<User> {
  // ...
}

// Good - using type for unions
type ConnectionStatus = 'pending' | 'connected' | 'expired' | 'error';

// Bad - implicit any
function process(data) { // Avoid
  // ...
}
```

### Function Signatures

```typescript
// Good - explicit return type
async function getUser(id: string): Promise<User | null> {
  return db.users.findFirst({ where: { id } });
}

// Good - destructured parameters with types
function createConnection({
  userId,
  serviceId,
  scopes,
}: {
  userId: string;
  serviceId: string;
  scopes?: string[];
}): Promise<Connection> {
  // ...
}
```

### Error Handling

```typescript
// Preferred - Result pattern (no throws)
async function getUser(id: string): Promise<{ data: User | null; error: Error | null }> {
  try {
    const user = await db.users.findFirst({ where: { id } });
    return { data: user, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

// Using the result
const { data: user, error } = await getUser('123');
if (error) {
  console.error('Failed to get user:', error.message);
  return;
}
// user is guaranteed to be non-null here
```

## Naming Conventions

### Files

- Use `kebab-case` for file names
- One component/function per file (usually)

```
src/
├── auth-context.ts
├── create-connection.ts
├── oauth-callback.ts
└── api-key-middleware.ts
```

### Variables and Functions

```typescript
// camelCase for variables and functions
const userId = 'user_123';
const isConnected = true;

function createConnection() { }
async function handleOAuthCallback() { }
```

### Classes and Types

```typescript
// PascalCase for classes and types
class AuthService { }
interface UserProfile { }
type ConnectionStatus = 'connected' | 'pending';
```

### Constants

```typescript
// SCREAMING_CASE for constants
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 30000;
const API_VERSION = 'v1';
```

### Database Columns

```typescript
// snake_case in database
export const connections = pgTable('connections', {
  id: uuid('id'),
  external_user_id: text('external_user_id'),
  created_at: timestamp('created_at'),
});
```

## Code Organization

### Imports

Order imports:
1. Node.js built-ins
2. External packages
3. Internal packages (@authlane/*)
4. Relative imports

```typescript
// 1. Built-ins
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';

// 2. External packages
import { Hono } from 'hono';
import { z } from 'zod';

// 3. Internal packages
import { db } from '@authlane/database';
import { encrypt } from '@authlane/crypto';

// 4. Relative imports
import { authMiddleware } from '../middleware/auth';
import { createConnection } from './create-connection';
```

### Function Organization

```typescript
// Export at the end
import { db } from '@authlane/database';

// Private helpers first (if needed)
function validateInput(input: string): boolean {
  return input.length > 0;
}

// Main exported function
async function createUser(params: CreateUserParams): Promise<User> {
  if (!validateInput(params.email)) {
    throw new Error('Invalid email');
  }
  return db.users.create(params);
}

export { createUser };
```

## React/Components

### Component Structure

```tsx
// Imports
import { useState, useEffect } from 'react';
import { clsx } from 'clsx';

// Types
interface ButtonProps {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

// Component
export function Button({
  variant = 'primary',
  size = 'md',
  children,
  onClick,
  disabled = false,
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'rounded font-medium transition-colors',
        variant === 'primary' && 'bg-blue-600 text-white hover:bg-blue-700',
        variant === 'secondary' && 'bg-gray-200 text-gray-800 hover:bg-gray-300',
        size === 'sm' && 'px-2 py-1 text-sm',
        size === 'md' && 'px-4 py-2',
        size === 'lg' && 'px-6 py-3 text-lg',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
```

### Hooks

```typescript
// Custom hook - prefix with 'use'
function useConnections(userId: string) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchConnections() {
      try {
        const data = await api.connections.list({ userId });
        setConnections(data);
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchConnections();
  }, [userId]);

  return { connections, isLoading, error };
}
```

## API Routes

### Route Structure

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';

const app = new Hono();

// Input validation schema
const createConnectionSchema = z.object({
  serviceId: z.string(),
  scopes: z.array(z.string()).optional(),
});

// Route handler
app.post(
  '/',
  authMiddleware,
  zValidator('json', createConnectionSchema),
  async (c) => {
    const { serviceId, scopes } = c.req.valid('json');
    const userId = c.get('userId');

    const { data, error } = await createConnection({
      userId,
      serviceId,
      scopes,
    });

    if (error) {
      return c.json({ error: error.message }, error.statusCode);
    }

    return c.json({ data });
  },
);

export default app;
```

## Comments

### When to Comment

```typescript
// Good - explains WHY
// We use a 10-minute expiry to balance security with UX.
// Shorter times increase friction, longer times increase CSRF risk.
const STATE_EXPIRY_MS = 10 * 60 * 1000;

// Good - complex algorithm explanation
// Token refresh uses exponential backoff:
// Attempt 1: immediate
// Attempt 2: 1s delay
// Attempt 3: 2s delay
// Attempt 4: 4s delay (max)
async function refreshWithBackoff(token: string) {
  // ...
}

// Bad - states the obvious
// Increment counter by 1
counter++; // Don't do this
```

### JSDoc for Public APIs

```typescript
/**
 * Creates a new OAuth connection for a user.
 *
 * @param params - Connection parameters
 * @param params.userId - The user's ID in your system
 * @param params.serviceId - The service to connect (e.g., 'github')
 * @param params.scopes - Optional specific scopes to request
 * @returns The authorization URL to redirect the user to
 *
 * @example
 * ```typescript
 * const { data } = await createConnection({
 *   userId: 'user_123',
 *   serviceId: 'github',
 * });
 * // Redirect user to data.authorizationUrl
 * ```
 */
export async function createConnection(params: CreateConnectionParams) {
  // ...
}
```

## Linting

### ESLint Configuration

The project uses ESLint with:
- @typescript-eslint
- eslint-plugin-react
- eslint-plugin-react-hooks

Run linting:
```bash
pnpm lint
pnpm lint:fix
```

### Prettier Configuration

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

## Git Commit Messages

Follow [Conventional Commits](https://conventionalcommits.org/):

```
feat: add Notion integration
fix: handle expired OAuth tokens
docs: update API reference
style: format code with prettier
refactor: extract auth middleware
test: add connection service tests
chore: update dependencies
```

## Next Steps

- [Contributing Guide](./contributing.md)
- [Testing Guide](./testing.md)
- [Development Setup](./setup.md)

