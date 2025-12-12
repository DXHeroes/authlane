# User Guides

Practical guides for using Authlane in various scenarios.

## Contents

### Getting Started

- [Quick Start](./getting-started/quick-start.md) - 5-minute setup guide
- [First Integration](./getting-started/first-integration.md) - Connect your first service
- [Using with AI Agents](./getting-started/ai-agents.md) - Integrate with Claude, GPT, etc.

### Dashboard

- [Dashboard Overview](./dashboard/overview.md)
- [Managing Services](./dashboard/services.md)
- [API Keys](./dashboard/api-keys.md)
- [Team Management](./dashboard/team.md)

### Use Cases

- [AI Agents](./use-cases/ai-agents.md) - Building AI assistants
- [SaaS Integration](./use-cases/saas-integration.md) - Adding OAuth to your app
- [Workflow Automation](./use-cases/workflow-automation.md) - Automating tasks

### Troubleshooting

- [Common Issues](./troubleshooting/common-issues.md)
- [OAuth Errors](./troubleshooting/oauth-errors.md)
- [Connection Problems](./troubleshooting/connections.md)

## Quick Start

### 1. Create an Account

Sign up at [authlane.com](https://authlane.com) or deploy self-hosted.

### 2. Create an Organization

Organizations isolate your users and connections:

```bash
# Using CLI
authlane org create "My Company"

# Or via dashboard
# Navigate to Dashboard → Create Organization
```

### 3. Generate an API Key

```bash
# Using CLI
authlane api-key create "Production Key" --scopes connections:read,tools:execute

# Or via dashboard
# Dashboard → API Keys → Create Key
```

### 4. Install SDK

```bash
npm install @authlane/sdk
```

### 5. Connect a Service

```typescript
import { Authlane } from '@authlane/sdk';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY,
});

// Start OAuth flow
const { data } = await authlane.oauth.authorize({
  userId: 'user_123',
  serviceId: 'github',
});

// Redirect user to authorization URL
console.log('Connect at:', data.authorizationUrl);
```

### 6. Use Credentials

```typescript
// After user connects, get credentials
const { data: creds } = await authlane.connections.getCredentials({
  userId: 'user_123',
  serviceId: 'github',
});

// Use token with GitHub API
const repos = await fetch('https://api.github.com/user/repos', {
  headers: { Authorization: `Bearer ${creds.access_token}` },
}).then(r => r.json());
```

## Common Tasks

### Check if User is Connected

```typescript
const { data } = await authlane.connections.list({
  userId: 'user_123',
  status: 'connected',
});

const hasGithub = data.items.some(c => c.serviceId === 'github');
```

### Execute a Tool

```typescript
const { data } = await authlane.tools.execute({
  userId: 'user_123',
  tool: 'github_create_issue',
  parameters: {
    owner: 'acme',
    repo: 'project',
    title: 'New issue',
  },
});
```

### Handle Expired Connections

```typescript
const { error } = await authlane.connections.getCredentials({
  userId: 'user_123',
  serviceId: 'github',
});

if (error?.code === 'CONNECTION_EXPIRED') {
  // Prompt user to reconnect
  const { data } = await authlane.oauth.authorize({
    userId: 'user_123',
    serviceId: 'github',
  });
  // Redirect to data.authorizationUrl
}
```

## Support

- **Documentation**: This guide
- **Discord**: [Community Discord](https://discord.gg/authlane)
- **GitHub**: [Issues](https://github.com/authlane/authlane/issues)
- **Email**: support@authlane.com

