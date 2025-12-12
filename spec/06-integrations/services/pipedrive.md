# Pipedrive Integration

Connect to Pipedrive CRM for sales pipeline management.

## Overview

| Property | Value |
|----------|-------|
| **Service ID** | `pipedrive` |
| **Name** | Pipedrive |
| **Auth Type** | OAuth 2.0 |
| **Documentation** | [Pipedrive API](https://developers.pipedrive.com/) |
| **API Version** | v1 |

## OAuth Configuration

### Authorization URL
```
https://oauth.pipedrive.com/oauth/authorize
```

### Token URL
```
https://oauth.pipedrive.com/oauth/token
```

## Scopes

### Available Scopes

| Scope | Description |
|-------|-------------|
| `deals:read` | Read deals |
| `deals:write` | Create/update deals |
| `deals:delete` | Delete deals |
| `contacts:read` | Read contacts (persons) |
| `contacts:write` | Create/update contacts |
| `contacts:delete` | Delete contacts |
| `persons:read` | Read persons |
| `persons:write` | Create/update persons |
| `persons:delete` | Delete persons |
| `organizations:read` | Read organizations |
| `organizations:write` | Create/update organizations |
| `organizations:delete` | Delete organizations |
| `activities:read` | Read activities |
| `activities:write` | Create/update activities |
| `activities:delete` | Delete activities |
| `pipelines:read` | Read pipelines |
| `users:read` | Read users |
| `notes:read` | Read notes |
| `notes:write` | Create/update notes |
| `products:read` | Read products |
| `products:write` | Create/update products |

### Default Scopes

```yaml
- deals:read
- deals:write
- contacts:read
- contacts:write
- persons:read
- persons:write
```

## Features

```yaml
features:
  rest_api: true
  webhooks: true
  custom_fields: true
```

## Connection Example

```typescript
// Start OAuth flow
const { data } = await authlane.oauth.authorize({
  userId: 'user_123',
  serviceId: 'pipedrive',
});

// Redirect user
window.location.href = data.authorizationUrl;
```

## Using Credentials

```typescript
// Get credentials
const { data: creds } = await authlane.connections.getCredentials({
  userId: 'user_123',
  serviceId: 'pipedrive',
});

// Note: Pipedrive uses company-specific API domains
// The API domain is stored in connection metadata
const apiDomain = creds.metadata?.api_domain || 'api.pipedrive.com';

// List deals
const response = await fetch(
  `https://${apiDomain}/v1/deals`,
  {
    headers: {
      Authorization: `Bearer ${creds.access_token}`,
    },
  }
);
```

## Available Tools

### pipedrive_create_deal
Create a new deal.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'pipedrive_create_deal',
  parameters: {
    title: 'Enterprise License',
    value: 50000,
    currency: 'USD',
    person_id: 123,
    org_id: 456,
  },
});
```

### pipedrive_list_deals
List deals with optional filters.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'pipedrive_list_deals',
  parameters: {
    status: 'open',
    sort: 'update_time DESC',
    limit: 50,
  },
});
```

### pipedrive_create_person
Create a new person (contact).

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'pipedrive_create_person',
  parameters: {
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+1234567890',
    org_id: 456,
  },
});
```

### pipedrive_search
Search across entities.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'pipedrive_search',
  parameters: {
    term: 'Acme',
    item_types: ['deal', 'person', 'organization'],
  },
});
```

### pipedrive_create_activity
Create an activity (task, call, meeting).

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'pipedrive_create_activity',
  parameters: {
    subject: 'Follow-up call',
    type: 'call',
    deal_id: 789,
    due_date: '2025-01-20',
    due_time: '14:00',
  },
});
```

## Setup Guide

### 1. Create Pipedrive App

1. Go to [Pipedrive Developer Hub](https://www.pipedrive.com/en/developer-hub)
2. Create a new app
3. Choose "OAuth & Access Scopes"

### 2. Configure OAuth

1. Add redirect URL: `https://your-domain.com/api/v1/oauth/callback/pipedrive`
2. Select required scopes

### 3. Get Credentials

1. Copy Client ID from app settings
2. Copy Client Secret from app settings

### 4. Configure in Authlane

```typescript
await authlane.services.configure({
  serviceId: 'pipedrive',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
});
```

## API Domain

Pipedrive uses company-specific API domains:
- Format: `https://{company}.pipedrive.com/v1/`
- The `api_domain` is returned during OAuth
- Authlane stores this automatically

## Custom Fields

Pipedrive supports custom fields on all entities:

```typescript
// Create deal with custom field
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'pipedrive_create_deal',
  parameters: {
    title: 'New Deal',
    value: 10000,
    // Custom field (hash key from Pipedrive)
    'abc123def456': 'Custom value',
  },
});
```

## Pagination

Pipedrive uses cursor-based pagination:

```typescript
// First page
const response1 = await fetch(`https://${apiDomain}/v1/deals?limit=50`);
const data1 = await response1.json();

// Next page
if (data1.additional_data?.pagination?.next_start) {
  const response2 = await fetch(
    `https://${apiDomain}/v1/deals?limit=50&start=${data1.additional_data.pagination.next_start}`
  );
}
```

## Links

- [Pipedrive API Documentation](https://developers.pipedrive.com/)
- [API Reference](https://developers.pipedrive.com/docs/api/v1)
- [OAuth Guide](https://pipedrive.readme.io/docs/marketplace-oauth-authorization)

