# Airtable Integration

Connect to Airtable for database and spreadsheet management.

## Overview

| Property | Value |
|----------|-------|
| **Service ID** | `airtable` |
| **Name** | Airtable |
| **Auth Type** | OAuth 2.0 |
| **Documentation** | [Airtable API](https://airtable.com/developers/web/api/introduction) |

## OAuth Configuration

### Authorization URL
```
https://airtable.com/oauth2/v1/authorize
```

### Token URL
```
https://airtable.com/oauth2/v1/token
```

## Scopes

### Available Scopes

| Scope | Description |
|-------|-------------|
| `data.records:read` | Read records |
| `data.records:write` | Create/update records |
| `data.recordComments:read` | Read record comments |
| `data.recordComments:write` | Create/update comments |
| `schema.bases:read` | Read base schemas |
| `schema.bases:write` | Modify base schemas |

### Default Scopes

```yaml
- data.records:read
- data.records:write
- schema.bases:read
```

## Connection Example

```typescript
// Start OAuth flow
const { data } = await authlane.oauth.authorize({
  userId: 'user_123',
  serviceId: 'airtable',
});

// Redirect user
window.location.href = data.authorizationUrl;
```

## Using Credentials

```typescript
// Get credentials
const { data: creds } = await authlane.connections.getCredentials({
  userId: 'user_123',
  serviceId: 'airtable',
});

// List records from a table
const response = await fetch(
  `https://api.airtable.com/v0/${baseId}/${tableName}`,
  {
    headers: {
      Authorization: `Bearer ${creds.access_token}`,
    },
  }
);
```

## Available Tools

### airtable_list_bases
List all accessible bases.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'airtable_list_bases',
  parameters: {},
});
```

### airtable_list_records
List records from a table.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'airtable_list_records',
  parameters: {
    baseId: 'appXXXXXXXXXXXXXX',
    tableName: 'Tasks',
    maxRecords: 100,
    filterByFormula: "{Status} = 'In Progress'",
  },
});
```

### airtable_create_record
Create a new record.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'airtable_create_record',
  parameters: {
    baseId: 'appXXXXXXXXXXXXXX',
    tableName: 'Tasks',
    fields: {
      Name: 'New Task',
      Status: 'Todo',
      'Due Date': '2025-01-20',
    },
  },
});
```

### airtable_update_record
Update an existing record.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'airtable_update_record',
  parameters: {
    baseId: 'appXXXXXXXXXXXXXX',
    tableName: 'Tasks',
    recordId: 'recXXXXXXXXXXXXXX',
    fields: {
      Status: 'Completed',
    },
  },
});
```

### airtable_search_records
Search records using a formula.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'airtable_search_records',
  parameters: {
    baseId: 'appXXXXXXXXXXXXXX',
    tableName: 'Contacts',
    filterByFormula: "FIND('john', LOWER({Email}))",
    sort: [{ field: 'Name', direction: 'asc' }],
  },
});
```

## Setup Guide

### 1. Create Airtable OAuth Integration

1. Go to [Airtable Developer Hub](https://airtable.com/developers)
2. Click "Build" → "OAuth integrations"
3. Create new OAuth integration
4. Fill in app details

### 2. Configure OAuth

1. Add redirect URL: `https://your-domain.com/api/v1/oauth/callback/airtable`
2. Select required scopes
3. Copy Client ID and Client Secret

### 3. Configure in Authlane

```typescript
await authlane.services.configure({
  serviceId: 'airtable',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
});
```

## Formula Reference

Airtable uses formulas for filtering:

```typescript
// Exact match
filterByFormula: "{Status} = 'Active'"

// Contains
filterByFormula: "FIND('search', {Name})"

// Date comparison
filterByFormula: "IS_AFTER({Due Date}, TODAY())"

// Multiple conditions
filterByFormula: "AND({Status} = 'Active', {Priority} = 'High')"

// Or conditions
filterByFormula: "OR({Status} = 'Active', {Status} = 'Pending')"
```

## Field Types

Airtable supports various field types:

| Type | Example Value |
|------|---------------|
| Single line text | `"Hello"` |
| Long text | `"Multi\nline\ntext"` |
| Number | `42` |
| Checkbox | `true` |
| Date | `"2025-01-20"` |
| Single select | `"Option A"` |
| Multiple select | `["Option A", "Option B"]` |
| Link to another record | `["recXXX", "recYYY"]` |
| Attachment | `[{ url: "..." }]` |

## Rate Limits

Airtable has strict rate limits:
- 5 requests per second per base
- Automatic retry with exponential backoff recommended

Authlane tools implement automatic rate limit handling.

## Links

- [Airtable API Documentation](https://airtable.com/developers/web/api/introduction)
- [OAuth Guide](https://airtable.com/developers/web/guides/oauth)
- [Formula Reference](https://support.airtable.com/docs/formula-field-reference)

