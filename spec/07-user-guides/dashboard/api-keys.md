# API Keys Guide

Manage API keys for programmatic access to Authlane.

## Overview

API keys authenticate your application with Authlane. Each key has:
- A unique identifier
- Associated scopes (permissions)
- Usage tracking
- Optional expiration

## Creating API Keys

### Via Dashboard

1. Go to **API Keys** in the dashboard
2. Click **Create API Key**
3. Enter a descriptive name
4. Select required scopes
5. (Optional) Set expiration date
6. Click **Create**
7. **Copy the key immediately** - it's shown only once

### Naming Convention

Use descriptive names that identify:
- Environment: `production`, `staging`, `development`
- Application: `web-app`, `mobile-app`, `ai-agent`
- Purpose: `read-only`, `admin`

Examples:
- `production-web-app`
- `staging-ai-agent`
- `development-testing`

## API Key Scopes

### Available Scopes

| Scope | Description |
|-------|-------------|
| `services:read` | Read service configurations |
| `services:write` | Modify service configurations |
| `connections:read` | Read connection data |
| `connections:write` | Create/delete connections |
| `tools:read` | Read tool definitions |
| `tools:execute` | Execute tools |
| `users:read` | Read user data |
| `admin:*` | Full admin access |

### Scope Recommendations

#### For AI Agents
```
- connections:read
- connections:write
- tools:execute
```

#### For Backend Services
```
- connections:read
- connections:write
```

#### For Admin Dashboards
```
- services:read
- services:write
- connections:read
- admin:*
```

#### For Read-Only Monitoring
```
- services:read
- connections:read
```

## Using API Keys

### In SDK

```typescript
import { Authlane } from '@authlane/sdk';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY,
});
```

### In HTTP Requests

```bash
curl -H "X-API-Key: your-api-key" \
  https://api.authlane.com/v1/services
```

Or using Bearer token:

```bash
curl -H "Authorization: Bearer your-api-key" \
  https://api.authlane.com/v1/services
```

## Security Best Practices

### 1. Use Environment Variables

Never hardcode API keys:

```typescript
// Good
const apiKey = process.env.AUTHLANE_API_KEY;

// Bad
const apiKey = 'ak_live_xxxxxxxxxxxx';
```

### 2. Restrict Scopes

Only grant necessary permissions:

```typescript
// Good - specific scopes
scopes: ['connections:read', 'tools:execute']

// Bad - too permissive
scopes: ['admin:*']
```

### 3. Rotate Keys Regularly

Schedule key rotation:
1. Create new key
2. Update application
3. Monitor both keys
4. Revoke old key

### 4. Use Separate Keys per Environment

- Production: `ak_live_xxx`
- Staging: `ak_test_xxx`
- Development: `ak_dev_xxx`

### 5. Monitor Usage

Check the dashboard for:
- Unusual request patterns
- Failed authentication attempts
- Unexpected scope usage

## Managing API Keys

### View API Keys

1. Go to **API Keys**
2. See all active keys with:
   - Name
   - Partial key (last 4 characters)
   - Created date
   - Last used
   - Scopes

### Edit API Key

API keys cannot be modified after creation. To change:
1. Create a new key with desired settings
2. Update your application
3. Revoke the old key

### Revoke API Key

1. Go to **API Keys**
2. Find the key to revoke
3. Click **Revoke**
4. Confirm the action

**Warning**: Revoking a key immediately invalidates it. Applications using the key will fail.

## Key Rotation Procedure

### 1. Create New Key

```typescript
// Dashboard or API
const newKey = await createApiKey({
  name: 'production-web-app-v2',
  scopes: ['connections:read', 'tools:execute'],
});
```

### 2. Deploy with Both Keys

```typescript
// Accept both during transition
const apiKey = process.env.AUTHLANE_API_KEY_NEW || process.env.AUTHLANE_API_KEY;
```

### 3. Monitor

Check both keys are working:
- New key is being used
- Old key usage declining

### 4. Remove Old Key

Once confirmed:
1. Remove old key from environment
2. Revoke old key in dashboard

## Troubleshooting

### "Invalid API Key"

- Verify the key is correct
- Check the key hasn't been revoked
- Ensure proper header format

### "Insufficient Scope"

- Check the key's scopes in dashboard
- Create a new key with required scopes

### "Rate Limited"

- Check current limits in dashboard
- Upgrade plan for higher limits
- Implement backoff in your code

## API Key Formats

| Environment | Prefix | Example |
|-------------|--------|---------|
| Production | `ak_live_` | `ak_live_abc123xyz789` |
| Test | `ak_test_` | `ak_test_def456uvw012` |

## Next Steps

- [SDK Installation](../../05-sdk/typescript/installation.md)
- [API Authentication](../../03-api-reference/authentication.md)
- [Rate Limiting](../../03-api-reference/rate-limiting.md)

