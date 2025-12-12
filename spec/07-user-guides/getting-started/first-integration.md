# First Integration Guide

Step-by-step guide to connecting your first service with Authlane.

## Prerequisites

- Authlane account (cloud or self-hosted)
- API key with `connections:write` scope
- Service account (e.g., GitHub account)

## Step 1: Install the SDK

```bash
npm install @authlane/sdk
```

## Step 2: Initialize the Client

```typescript
// lib/authlane.ts
import { Authlane } from '@authlane/sdk';

export const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY,
});
```

## Step 3: List Available Services

First, check which services are available:

```typescript
const { data: services } = await authlane.services.list();

console.log('Available services:');
services.items.forEach(service => {
  console.log(`- ${service.name} (${service.id})`);
});
```

Example output:
```
Available services:
- GitHub (github)
- Slack (slack)
- Google Calendar (google-calendar)
- Notion (notion)
```

## Step 4: Start the OAuth Flow

Create an endpoint to initiate the connection:

```typescript
// pages/api/connect.ts (Next.js example)
import { NextApiRequest, NextApiResponse } from 'next';
import { authlane } from '../../lib/authlane';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Get the user ID from your auth system
  const userId = req.session.userId;
  const serviceId = req.query.service as string;

  // Start OAuth flow
  const { data, error } = await authlane.oauth.authorize({
    userId,
    serviceId,
    redirectUrl: `${process.env.APP_URL}/callback`,
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  // Redirect to the authorization URL
  res.redirect(data.authorizationUrl);
}
```

## Step 5: Handle the Callback

Create a callback handler:

```typescript
// pages/callback.tsx (Next.js example)
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function Callback() {
  const router = useRouter();
  const [status, setStatus] = useState('Processing...');

  useEffect(() => {
    if (!router.isReady) return;

    const { code, state, error } = router.query;

    if (error) {
      setStatus(`Error: ${error}`);
      return;
    }

    // The callback is handled by Authlane automatically
    // Just check if the connection was successful
    checkConnection();
  }, [router.isReady, router.query]);

  async function checkConnection() {
    const response = await fetch('/api/check-connection');
    const data = await response.json();

    if (data.connected) {
      setStatus('Connected successfully!');
      setTimeout(() => router.push('/dashboard'), 2000);
    } else {
      setStatus('Connection failed. Please try again.');
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{status}</h1>
      </div>
    </div>
  );
}
```

## Step 6: Use the Connection

After the user connects, you can use their credentials:

```typescript
// pages/api/github/repos.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { authlane } from '../../../lib/authlane';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const userId = req.session.userId;

  // Get credentials
  const { data: creds, error } = await authlane.connections.getCredentials({
    userId,
    serviceId: 'github',
  });

  if (error) {
    if (error.code === 'CONNECTION_NOT_FOUND') {
      return res.status(400).json({
        error: 'GitHub not connected',
        needsConnection: true,
      });
    }
    return res.status(500).json({ error: error.message });
  }

  // Use credentials with GitHub API
  const response = await fetch('https://api.github.com/user/repos', {
    headers: {
      Authorization: `Bearer ${creds.access_token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  const repos = await response.json();
  res.json(repos);
}
```

## Step 7: Display Connection Status

Show users their connected services:

```typescript
// components/Connections.tsx
import { useEffect, useState } from 'react';

export function Connections() {
  const [connections, setConnections] = useState([]);

  useEffect(() => {
    async function loadConnections() {
      const response = await fetch('/api/connections');
      const data = await response.json();
      setConnections(data.connections);
    }
    loadConnections();
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Connected Services</h2>

      {connections.map(conn => (
        <div key={conn.serviceId} className="flex items-center justify-between p-4 border rounded">
          <div>
            <p className="font-medium">{conn.serviceName}</p>
            <p className="text-sm text-gray-500">
              {conn.status === 'connected' ? 'Connected' : 'Needs reconnection'}
            </p>
          </div>

          {conn.status === 'connected' ? (
            <button
              onClick={() => disconnect(conn.serviceId)}
              className="text-red-600"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => connect(conn.serviceId)}
              className="text-blue-600"
            >
              Reconnect
            </button>
          )}
        </div>
      ))}

      <button
        onClick={() => window.location.href = '/api/connect?service=github'}
        className="w-full p-4 border-2 border-dashed rounded text-gray-500"
      >
        + Connect New Service
      </button>
    </div>
  );
}
```

## Complete Example

Here's a complete Express.js example:

```typescript
// server.ts
import express from 'express';
import { Authlane } from '@authlane/sdk';

const app = express();
const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY,
});

// Start connection
app.get('/connect/:service', async (req, res) => {
  const { service } = req.params;
  const userId = req.session.userId; // From your auth

  const { data, error } = await authlane.oauth.authorize({
    userId,
    serviceId: service,
    redirectUrl: `${process.env.APP_URL}/callback`,
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.redirect(data.authorizationUrl);
});

// List connections
app.get('/connections', async (req, res) => {
  const userId = req.session.userId;

  const { data } = await authlane.connections.list({ userId });
  res.json({ connections: data.items });
});

// Get GitHub repos
app.get('/github/repos', async (req, res) => {
  const userId = req.session.userId;

  const { data: creds, error } = await authlane.connections.getCredentials({
    userId,
    serviceId: 'github',
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  const repos = await fetch('https://api.github.com/user/repos', {
    headers: { Authorization: `Bearer ${creds.access_token}` },
  }).then(r => r.json());

  res.json(repos);
});

app.listen(3000);
```

## Next Steps

- [Using with AI Agents](./ai-agents.md) - Build AI assistants with Authlane
- [Dashboard Overview](../dashboard/overview.md) - Manage your integrations
- [Troubleshooting](../troubleshooting/common-issues.md) - Common issues and solutions

