# Use Case: SaaS Integration

Add third-party service connections to your SaaS application.

## Overview

SaaS applications often need to integrate with external services:
- Import data from other platforms
- Sync with project management tools
- Connect to CRMs and communication tools
- Enable workflow automation

Authlane handles the OAuth complexity so you can focus on your core product.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Your SaaS Application                       │
│                                                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │   Frontend  │    │   Backend   │    │   Background Jobs   │  │
│  │             │    │             │    │                     │  │
│  │  - Settings │    │  - API      │    │  - Sync tasks       │  │
│  │  - Connect  │    │  - Business │    │  - Data import      │  │
│  │    buttons  │    │    logic    │    │  - Notifications    │  │
│  └──────┬──────┘    └──────┬──────┘    └──────────┬──────────┘  │
│         │                  │                       │             │
└─────────┼──────────────────┼───────────────────────┼─────────────┘
          │                  │                       │
          │                  ▼                       │
          │           ┌─────────────┐                │
          └──────────▶│  Authlane   │◀───────────────┘
                      │             │
                      │  - OAuth    │
                      │  - Tokens   │
                      │  - Status   │
                      └──────┬──────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
    │   GitHub    │   │    Slack    │   │    Jira     │
    └─────────────┘   └─────────────┘   └─────────────┘
```

## Implementation

### 1. Integration Settings Page

```tsx
// pages/settings/integrations.tsx
import { useEffect, useState } from 'react';

interface Integration {
  serviceId: string;
  serviceName: string;
  status: 'connected' | 'disconnected' | 'expired';
  connectedAt?: string;
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [availableServices, setAvailableServices] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [integrationsRes, servicesRes] = await Promise.all([
      fetch('/api/integrations'),
      fetch('/api/services'),
    ]);

    setIntegrations(await integrationsRes.json());
    setAvailableServices(await servicesRes.json());
  }

  async function connect(serviceId: string) {
    const response = await fetch(`/api/integrations/connect/${serviceId}`, {
      method: 'POST',
    });
    const { authUrl } = await response.json();
    window.location.href = authUrl;
  }

  async function disconnect(serviceId: string) {
    if (confirm('Are you sure you want to disconnect this service?')) {
      await fetch(`/api/integrations/${serviceId}`, { method: 'DELETE' });
      loadData();
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Integrations</h1>

      <div className="space-y-4">
        {availableServices.map(service => {
          const integration = integrations.find(i => i.serviceId === service.id);

          return (
            <div key={service.id} className="border rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <img src={service.icon} alt="" className="w-10 h-10" />
                <div>
                  <h3 className="font-medium">{service.name}</h3>
                  <p className="text-sm text-gray-500">{service.description}</p>
                </div>
              </div>

              <div>
                {integration?.status === 'connected' ? (
                  <div className="flex items-center gap-2">
                    <span className="text-green-600 text-sm">Connected</span>
                    <button
                      onClick={() => disconnect(service.id)}
                      className="text-red-600 text-sm"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : integration?.status === 'expired' ? (
                  <button
                    onClick={() => connect(service.id)}
                    className="bg-yellow-500 text-white px-4 py-2 rounded"
                  >
                    Reconnect
                  </button>
                ) : (
                  <button
                    onClick={() => connect(service.id)}
                    className="bg-blue-500 text-white px-4 py-2 rounded"
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

### 2. Backend API Routes

```typescript
// api/integrations.ts
import express from 'express';
import { Authlane } from '@authlane/sdk';

const router = express.Router();
const authlane = new Authlane({ apiKey: process.env.AUTHLANE_API_KEY });

// List user's integrations
router.get('/', async (req, res) => {
  const userId = req.user.id;

  const { data } = await authlane.connections.list({ userId });

  const integrations = data.items.map(conn => ({
    serviceId: conn.serviceId,
    serviceName: conn.service.name,
    status: conn.status,
    connectedAt: conn.connectedAt,
  }));

  res.json(integrations);
});

// Start OAuth flow
router.post('/connect/:serviceId', async (req, res) => {
  const userId = req.user.id;
  const { serviceId } = req.params;

  const { data, error } = await authlane.oauth.authorize({
    userId,
    serviceId,
    redirectUrl: `${process.env.APP_URL}/settings/integrations/callback`,
    metadata: {
      returnUrl: req.body.returnUrl || '/settings/integrations',
    },
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json({ authUrl: data.authorizationUrl });
});

// Disconnect integration
router.delete('/:serviceId', async (req, res) => {
  const userId = req.user.id;
  const { serviceId } = req.params;

  const { error } = await authlane.connections.delete({
    userId,
    serviceId,
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json({ success: true });
});

export default router;
```

### 3. Using Integrations

```typescript
// services/github-sync.ts
import { Authlane } from '@authlane/sdk';

const authlane = new Authlane({ apiKey: process.env.AUTHLANE_API_KEY });

export async function syncGitHubIssues(userId: string, projectId: string) {
  // Get credentials
  const { data: creds, error } = await authlane.connections.getCredentials({
    userId,
    serviceId: 'github',
  });

  if (error) {
    if (error.code === 'CONNECTION_NOT_FOUND') {
      return { success: false, reason: 'not_connected' };
    }
    if (error.code === 'CONNECTION_EXPIRED') {
      return { success: false, reason: 'expired' };
    }
    throw error;
  }

  // Fetch issues from GitHub
  const response = await fetch(
    'https://api.github.com/repos/owner/repo/issues',
    {
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );

  const issues = await response.json();

  // Sync to your database
  for (const issue of issues) {
    await db.issues.upsert({
      where: { githubId: issue.id },
      create: {
        projectId,
        githubId: issue.id,
        title: issue.title,
        body: issue.body,
        state: issue.state,
      },
      update: {
        title: issue.title,
        body: issue.body,
        state: issue.state,
      },
    });
  }

  return { success: true, synced: issues.length };
}
```

### 4. Background Sync Jobs

```typescript
// jobs/sync-integrations.ts
import { Queue, Worker } from 'bullmq';
import { Authlane } from '@authlane/sdk';

const authlane = new Authlane({ apiKey: process.env.AUTHLANE_API_KEY });
const syncQueue = new Queue('integration-sync');

// Schedule periodic syncs
async function scheduleUserSyncs() {
  const users = await db.users.findMany({
    where: { syncEnabled: true },
  });

  for (const user of users) {
    await syncQueue.add('sync', { userId: user.id }, {
      repeat: { every: 15 * 60 * 1000 }, // Every 15 minutes
      jobId: `sync-${user.id}`,
    });
  }
}

// Process sync jobs
const worker = new Worker('integration-sync', async (job) => {
  const { userId } = job.data;

  // Get user's connections
  const { data: connections } = await authlane.connections.list({
    userId,
    status: 'connected',
  });

  // Sync each connected service
  for (const conn of connections.items) {
    try {
      switch (conn.serviceId) {
        case 'github':
          await syncGitHubIssues(userId);
          break;
        case 'jira':
          await syncJiraTickets(userId);
          break;
        case 'slack':
          await syncSlackChannels(userId);
          break;
      }
    } catch (error) {
      console.error(`Sync failed for ${conn.serviceId}:`, error);
      // Mark for retry or notify user
    }
  }
});
```

## Common Patterns

### Import Wizard

```tsx
function ImportWizard() {
  const [step, setStep] = useState(1);
  const [source, setSource] = useState('');
  const [data, setData] = useState([]);

  // Step 1: Select source
  // Step 2: Connect if needed
  // Step 3: Select what to import
  // Step 4: Review and confirm
  // Step 5: Import progress

  return (
    <div>
      {step === 1 && (
        <SourceSelection onSelect={setSource} onNext={() => setStep(2)} />
      )}
      {step === 2 && (
        <ConnectionStep service={source} onConnected={() => setStep(3)} />
      )}
      {step === 3 && (
        <DataSelection service={source} onSelect={setData} onNext={() => setStep(4)} />
      )}
      {step === 4 && (
        <ReviewStep data={data} onConfirm={() => setStep(5)} />
      )}
      {step === 5 && (
        <ImportProgress data={data} />
      )}
    </div>
  );
}
```

### Webhook Integration

```typescript
// Receive webhooks from external services
router.post('/webhooks/github', async (req, res) => {
  const event = req.headers['x-github-event'];
  const payload = req.body;

  // Verify webhook signature
  if (!verifyGitHubSignature(req)) {
    return res.status(401).send('Unauthorized');
  }

  // Find the user this belongs to
  const installation = await db.installations.findUnique({
    where: { installationId: payload.installation.id },
  });

  if (!installation) {
    return res.status(200).send('OK'); // Acknowledge but ignore
  }

  // Process the event
  switch (event) {
    case 'issues':
      await handleIssueEvent(installation.userId, payload);
      break;
    case 'push':
      await handlePushEvent(installation.userId, payload);
      break;
  }

  res.status(200).send('OK');
});
```

## Best Practices

1. **Handle Token Expiration**: Check and refresh tokens proactively
2. **Graceful Degradation**: App works without integrations
3. **Clear Status**: Show connection status clearly
4. **Easy Reconnection**: One-click reconnect for expired tokens
5. **Data Mapping**: Document how external data maps to your model

## Next Steps

- [Workflow Automation](./workflow-automation.md)
- [API Reference](../../03-api-reference/index.md)
- [Security Best Practices](../../04-security/index.md)

