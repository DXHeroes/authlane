# Salesforce Integration

Connect to Salesforce CRM for comprehensive customer relationship management.

## Overview

| Property | Value |
|----------|-------|
| **Service ID** | `salesforce` |
| **Name** | Salesforce |
| **Auth Type** | OAuth 2.0 |
| **Documentation** | [Salesforce REST API](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/) |
| **API Version** | v60.0 |

## OAuth Configuration

### Authorization URL
```
https://login.salesforce.com/services/oauth2/authorize
```

### Token URL
```
https://login.salesforce.com/services/oauth2/token
```

## Scopes

### Available Scopes

| Scope | Description |
|-------|-------------|
| `api` | Access REST API |
| `refresh_token` | Get refresh tokens |
| `offline_access` | Offline access |
| `id` | Access identity URL |
| `openid` | OpenID Connect |
| `chatter_api` | Chatter API access |
| `full` | Full access to all data |
| `web` | Web access |

### Default Scopes

```yaml
- api
- refresh_token
- id
```

## Features

```yaml
features:
  soql: true        # Salesforce Object Query Language
  bulk_api: true    # Bulk data operations
  rest_api: true    # REST API access
  metadata_api: true # Metadata access
```

## Connection Example

```typescript
// Start OAuth flow
const { data } = await authlane.oauth.authorize({
  userId: 'user_123',
  serviceId: 'salesforce',
});

// Redirect user
window.location.href = data.authorizationUrl;
```

## Using Credentials

```typescript
// Get credentials
const { data: creds } = await authlane.connections.getCredentials({
  userId: 'user_123',
  serviceId: 'salesforce',
});

// Note: Salesforce uses instance-specific URLs
// The instance URL is stored in connection metadata
const instanceUrl = creds.metadata?.instance_url || 'https://na1.salesforce.com';

// Query accounts
const response = await fetch(
  `${instanceUrl}/services/data/v60.0/query?` +
    new URLSearchParams({
      q: 'SELECT Id, Name, Industry FROM Account LIMIT 10',
    }),
  {
    headers: {
      Authorization: `Bearer ${creds.access_token}`,
    },
  }
);
```

## Available Tools

### salesforce_query
Execute a SOQL query.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'salesforce_query',
  parameters: {
    query: 'SELECT Id, Name, Email FROM Contact WHERE LastModifiedDate > LAST_N_DAYS:7',
  },
});
```

### salesforce_create_record
Create a new record.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'salesforce_create_record',
  parameters: {
    objectType: 'Lead',
    data: {
      FirstName: 'John',
      LastName: 'Doe',
      Company: 'Acme Inc',
      Email: 'john@acme.com',
    },
  },
});
```

### salesforce_update_record
Update an existing record.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'salesforce_update_record',
  parameters: {
    objectType: 'Lead',
    recordId: '00Q1234567890AB',
    data: {
      Status: 'Qualified',
      Rating: 'Hot',
    },
  },
});
```

### salesforce_search
Full-text search using SOSL.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'salesforce_search',
  parameters: {
    searchTerm: 'Acme',
    objects: ['Account', 'Contact', 'Lead'],
  },
});
```

## Setup Guide

### 1. Create Salesforce Connected App

1. Go to Setup in Salesforce
2. Search for "App Manager"
3. Click "New Connected App"
4. Fill in required fields

### 2. Configure OAuth

1. Enable OAuth Settings
2. Add callback URL: `https://your-domain.com/api/v1/oauth/callback/salesforce`
3. Select OAuth scopes

### 3. Get Credentials

1. After saving, view app details
2. Copy Consumer Key (Client ID)
3. Copy Consumer Secret (Client Secret)

### 4. Configure in Authlane

```typescript
await authlane.services.configure({
  serviceId: 'salesforce',
  clientId: 'your-consumer-key',
  clientSecret: 'your-consumer-secret',
});
```

## Instance URLs

Salesforce uses instance-specific URLs. After OAuth:
- The instance URL is returned (e.g., `https://na1.salesforce.com`)
- All API calls must use this URL
- Authlane stores this automatically in connection metadata

## SOQL Examples

```sql
-- Simple query
SELECT Id, Name FROM Account

-- With WHERE clause
SELECT Id, Name, Email FROM Contact WHERE AccountId = '001xx000003DGb2'

-- Date filtering
SELECT Id, Name FROM Opportunity WHERE CloseDate = THIS_QUARTER

-- Aggregate query
SELECT COUNT(Id), StageName FROM Opportunity GROUP BY StageName

-- Relationship query
SELECT Id, Name, (SELECT Id, Name FROM Contacts) FROM Account
```

## Sandbox vs Production

For sandbox environments, use:
- Authorization: `https://test.salesforce.com/services/oauth2/authorize`
- Token: `https://test.salesforce.com/services/oauth2/token`

Authlane can be configured per-environment.

## Links

- [Salesforce REST API](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/)
- [SOQL Reference](https://developer.salesforce.com/docs/atlas.en-us.soql_sosl.meta/soql_sosl/)
- [OAuth Guide](https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_flows.htm)

