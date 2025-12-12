# Quick Start Guide

Get up and running with Authlane in 5 minutes.

## Prerequisites

- Node.js 18+
- npm, yarn, or pnpm

## Step 1: Get API Key

### Option A: Managed Cloud

1. Sign up at [authlane.com](https://authlane.com)
2. Create an organization
3. Go to Dashboard → API Keys
4. Create a new API key with required scopes

### Option B: Self-Hosted

1. Clone the repository
2. Set up environment variables
3. Run `pnpm dev`
4. Access dashboard at `http://localhost:3000`

## Step 2: Install SDK

```bash
npm install @authlane/sdk
```

## Step 3: Initialize Client

```typescript
// lib/authlane.ts
import { Authlane } from '@authlane/sdk';

export const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY!,
});
```

## Step 4: Connect a Service

### Server-Side (Get Authorization URL)

```typescript
// api/connect.ts
import { authlane } from '../lib/authlane';

export async function startConnection(userId: string, serviceId: string) {
  const { data, error } = await authlane.oauth.authorize({
    userId,
    serviceId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data.authorizationUrl;
}
```

### Client-Side (Redirect User)

```typescript
// Connect button click handler
async function connectGitHub() {
  const url = await fetch('/api/connect?service=github').then(r => r.text());
  window.location.href = url;
}
```

## Step 5: Use Credentials

After the user completes the OAuth flow, retrieve credentials:

```typescript
import { authlane } from '../lib/authlane';

export async function getGitHubRepos(userId: string) {
  // Get credentials
  const { data: creds, error } = await authlane.connections.getCredentials({
    userId,
    serviceId: 'github',
  });

  if (error) {
    if (error.code === 'CONNECTION_NOT_FOUND') {
      // User hasn't connected GitHub yet
      return { needsConnection: true };
    }
    throw new Error(error.message);
  }

  // Use with GitHub API
  const response = await fetch('https://api.github.com/user/repos', {
    headers: {
      Authorization: `Bearer ${creds.access_token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  return response.json();
}
```

## Step 6: Execute Tools (Optional)

Use AI-ready tools for common operations:

```typescript
// Instead of making API calls directly
const { data } = await authlane.tools.execute({
  userId: 'user_123',
  tool: 'github_create_issue',
  parameters: {
    owner: 'acme',
    repo: 'my-project',
    title: 'Bug report',
    body: 'Description of the bug...',
  },
});

console.log('Created issue:', data.result.html_url);
```

## Complete Example

### API Route (Next.js)

```typescript
// app/api/github/repos/route.ts
import { NextResponse } from 'next/server';
import { authlane } from '@/lib/authlane';
import { auth } from '@/lib/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await authlane.connections.getCredentials({
    userId: session.user.id,
    serviceId: 'github',
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }

  const repos = await fetch('https://api.github.com/user/repos', {
    headers: { Authorization: `Bearer ${data.access_token}` },
  }).then(r => r.json());

  return NextResponse.json(repos);
}
```

### React Component

```tsx
// components/GitHubRepos.tsx
import { useConnections, useConnect } from '@authlane/react';

export function GitHubRepos() {
  const { connections, isLoading } = useConnections();
  const { connect, isConnecting } = useConnect();

  const isConnected = connections.some(
    c => c.serviceId === 'github' && c.status === 'connected'
  );

  if (isLoading) return <div>Loading...</div>;

  if (!isConnected) {
    return (
      <button onClick={() => connect('github')} disabled={isConnecting}>
        Connect GitHub
      </button>
    );
  }

  return <ReposList />;
}
```

## Next Steps

- [First Integration](./first-integration.md) - Detailed integration guide
- [Using with AI Agents](./ai-agents.md) - Build AI assistants
- [Dashboard Overview](../dashboard/overview.md) - Manage your integrations

## Troubleshooting

### "API key not found"

Ensure `AUTHLANE_API_KEY` is set in your environment.

### "Connection not found"

The user hasn't connected the service yet. Redirect them to authorize.

### "Connection expired"

The OAuth token expired and couldn't be refreshed. Prompt user to reconnect.

