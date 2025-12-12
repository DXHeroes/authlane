# TypeScript SDK Installation

Install and configure the Authlane TypeScript SDK.

## Installation

```bash
# npm
npm install @authlane/sdk

# yarn
yarn add @authlane/sdk

# pnpm
pnpm add @authlane/sdk
```

## Requirements

- Node.js 18.0.0 or later
- TypeScript 4.7+ (recommended)

## Basic Setup

### Initialize the Client

```typescript
import { Authlane } from '@authlane/sdk';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY,
});
```

### Configuration Options

```typescript
interface AuthlaneConfig {
  // Required
  apiKey: string;

  // Optional
  baseUrl?: string;      // Default: 'https://api.authlane.com'
  timeout?: number;      // Request timeout in ms (default: 30000)
  retries?: number;      // Number of retries (default: 3)
  onError?: (error: ApiError) => void;  // Global error handler
}
```

### Environment Variables

```bash
# .env
AUTHLANE_API_KEY=ak_prod_xxxxxxxxxxxxxxxxxxxx
AUTHLANE_BASE_URL=https://api.authlane.com  # Optional
```

```typescript
import { Authlane } from '@authlane/sdk';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
  baseUrl: process.env.AUTHLANE_BASE_URL,
});
```

## Framework Integration

### Next.js

```typescript
// lib/authlane.ts
import { Authlane } from '@authlane/sdk';

// Server-side only
export const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
});
```

```typescript
// app/api/connections/route.ts
import { authlane } from '@/lib/authlane';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  const { data, error } = await authlane.connections.list({
    userId: userId!,
  });

  if (error) {
    return NextResponse.json({ error }, { status: error.statusCode });
  }

  return NextResponse.json(data);
}
```

### Express

```typescript
// lib/authlane.ts
import { Authlane } from '@authlane/sdk';

export const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
});
```

```typescript
// routes/connections.ts
import { Router } from 'express';
import { authlane } from '../lib/authlane';

const router = Router();

router.get('/connections', async (req, res) => {
  const userId = req.user.id; // From your auth middleware

  const { data, error } = await authlane.connections.list({ userId });

  if (error) {
    return res.status(error.statusCode).json({ error });
  }

  res.json(data);
});

export default router;
```

### Hono

```typescript
// lib/authlane.ts
import { Authlane } from '@authlane/sdk';

export const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
});
```

```typescript
// routes/connections.ts
import { Hono } from 'hono';
import { authlane } from '../lib/authlane';

const app = new Hono();

app.get('/connections', async (c) => {
  const userId = c.get('userId');

  const { data, error } = await authlane.connections.list({ userId });

  if (error) {
    return c.json({ error }, error.statusCode);
  }

  return c.json(data);
});

export default app;
```

## TypeScript Configuration

Recommended `tsconfig.json` settings:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

## Verifying Installation

```typescript
import { Authlane } from '@authlane/sdk';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
});

// Verify connection
async function verify() {
  const { data, error } = await authlane.services.list();

  if (error) {
    console.error('Connection failed:', error.message);
    process.exit(1);
  }

  console.log('Connected! Available services:', data.items.length);
}

verify();
```

## Common Issues

### "API key not found"

```typescript
// Ensure API key is set
if (!process.env.AUTHLANE_API_KEY) {
  throw new Error('AUTHLANE_API_KEY environment variable is required');
}
```

### TypeScript errors with types

```bash
# Ensure you have the latest version
npm update @authlane/sdk

# Or reinstall
npm remove @authlane/sdk && npm install @authlane/sdk
```

### Network errors

```typescript
const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
  timeout: 60000,  // Increase timeout
  retries: 5,      // More retries
});
```

## Next Steps

- [Configuration Options](./configuration.md)
- [API Reference](./api-reference.md)
- [Examples](./examples.md)

