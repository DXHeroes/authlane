# HubSpot Integration

Connect to HubSpot CRM for contact and deal management.

## Overview

| Property | Value |
|----------|-------|
| **Service ID** | `hubspot` |
| **Name** | HubSpot |
| **Auth Type** | OAuth 2.0 |
| **Documentation** | [HubSpot API](https://developers.hubspot.com/) |

## OAuth Configuration

### Authorization URL
```
https://app.hubspot.com/oauth/authorize
```

### Token URL
```
https://api.hubapi.com/oauth/v1/token
```

## Scopes

### Available Scopes

| Scope | Description |
|-------|-------------|
| `crm.objects.contacts.read` | Read contacts |
| `crm.objects.contacts.write` | Create/update contacts |
| `crm.objects.deals.read` | Read deals |
| `crm.objects.deals.write` | Create/update deals |
| `crm.objects.companies.read` | Read companies |
| `crm.objects.companies.write` | Create/update companies |

### Default Scopes

```yaml
- crm.objects.contacts.read
- crm.objects.contacts.write
- crm.objects.deals.read
- crm.objects.deals.write
```

## Connection Example

```typescript
// Start OAuth flow
const { data } = await authlane.oauth.authorize({
  userId: 'user_123',
  serviceId: 'hubspot',
});

// Redirect user
window.location.href = data.authorizationUrl;
```

## Using Credentials

```typescript
// Get credentials
const { data: creds } = await authlane.connections.getCredentials({
  userId: 'user_123',
  serviceId: 'hubspot',
});

// List contacts
const response = await fetch(
  'https://api.hubapi.com/crm/v3/objects/contacts',
  {
    headers: {
      Authorization: `Bearer ${creds.access_token}`,
    },
  }
);
```

## Available Tools

### hubspot_create_contact
Create a new contact.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'hubspot_create_contact',
  parameters: {
    email: 'john@example.com',
    firstname: 'John',
    lastname: 'Doe',
    phone: '+1234567890',
  },
});
```

### hubspot_search_contacts
Search contacts by criteria.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'hubspot_search_contacts',
  parameters: {
    query: 'john@example.com',
    properties: ['email', 'firstname', 'lastname', 'phone'],
  },
});
```

### hubspot_create_deal
Create a new deal.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'hubspot_create_deal',
  parameters: {
    dealname: 'Enterprise Contract',
    amount: '50000',
    pipeline: 'default',
    dealstage: 'appointmentscheduled',
  },
});
```

### hubspot_list_deals
List deals with optional filters.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'hubspot_list_deals',
  parameters: {
    properties: ['dealname', 'amount', 'dealstage'],
    limit: 50,
  },
});
```

## Setup Guide

### 1. Create HubSpot App

1. Go to [HubSpot Developer Portal](https://developers.hubspot.com/)
2. Create a developer account
3. Create a new app

### 2. Configure OAuth

1. Navigate to "Auth" tab
2. Add redirect URL: `https://your-domain.com/api/v1/oauth/callback/hubspot`
3. Select required scopes

### 3. Get Credentials

1. Copy Client ID from app settings
2. Copy Client Secret from app settings

### 4. Configure in Authlane

```typescript
await authlane.services.configure({
  serviceId: 'hubspot',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
});
```

## CRM Objects

HubSpot uses a unified CRM API for different object types:

### Contacts
```
POST /crm/v3/objects/contacts
GET /crm/v3/objects/contacts/{id}
PATCH /crm/v3/objects/contacts/{id}
```

### Deals
```
POST /crm/v3/objects/deals
GET /crm/v3/objects/deals/{id}
PATCH /crm/v3/objects/deals/{id}
```

### Companies
```
POST /crm/v3/objects/companies
GET /crm/v3/objects/companies/{id}
PATCH /crm/v3/objects/companies/{id}
```

## Associations

Link objects together:

```typescript
// Associate contact with company
await fetch(
  'https://api.hubapi.com/crm/v3/associations/contact/company/batch/create',
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: [{
        from: { id: contactId },
        to: { id: companyId },
        type: 'contact_to_company',
      }],
    }),
  }
);
```

## Links

- [HubSpot Developer Documentation](https://developers.hubspot.com/)
- [CRM API Reference](https://developers.hubspot.com/docs/api/crm/contacts)
- [OAuth Guide](https://developers.hubspot.com/docs/api/working-with-oauth)

