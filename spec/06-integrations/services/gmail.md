# Gmail Integration

Connect to Gmail for email access and management.

## Overview

| Property | Value |
|----------|-------|
| **Service ID** | `gmail` |
| **Name** | Gmail |
| **Auth Type** | OAuth 2.0 |
| **Documentation** | [Gmail API](https://developers.google.com/gmail) |

## OAuth Configuration

### Authorization URL
```
https://accounts.google.com/o/oauth2/v2/auth
```

### Token URL
```
https://oauth2.googleapis.com/token
```

## Scopes

### Available Scopes

| Scope | Description |
|-------|-------------|
| `https://www.googleapis.com/auth/gmail.send` | Send emails |
| `https://www.googleapis.com/auth/gmail.readonly` | Read-only access |
| `https://www.googleapis.com/auth/gmail.modify` | Read/write access (no delete) |
| `https://www.googleapis.com/auth/gmail.compose` | Create and modify drafts |
| `https://www.googleapis.com/auth/gmail.labels` | Manage labels |

### Default Scopes

```yaml
- https://www.googleapis.com/auth/gmail.send
- https://www.googleapis.com/auth/gmail.readonly
```

## Connection Example

```typescript
// Start OAuth flow
const { data } = await authlane.oauth.authorize({
  userId: 'user_123',
  serviceId: 'gmail',
  scopes: [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
  ],
});

// Redirect user
window.location.href = data.authorizationUrl;
```

## Using Credentials

```typescript
// Get credentials
const { data: creds } = await authlane.connections.getCredentials({
  userId: 'user_123',
  serviceId: 'gmail',
});

// List messages
const response = await fetch(
  'https://gmail.googleapis.com/gmail/v1/users/me/messages?' +
    new URLSearchParams({
      maxResults: '10',
      q: 'is:unread',
    }),
  {
    headers: {
      Authorization: `Bearer ${creds.access_token}`,
    },
  }
);
```

## Available Tools

### gmail_send_email
Send an email.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'gmail_send_email',
  parameters: {
    to: 'recipient@example.com',
    subject: 'Meeting Follow-up',
    body: 'Hi, thanks for the meeting today...',
    cc: 'manager@example.com',
  },
});
```

### gmail_list_messages
List emails with optional query.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'gmail_list_messages',
  parameters: {
    query: 'from:boss@company.com is:unread',
    maxResults: 25,
  },
});
```

### gmail_get_message
Get a specific email.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'gmail_get_message',
  parameters: {
    messageId: '18d1234abcd',
    format: 'full', // 'minimal', 'full', 'raw', 'metadata'
  },
});
```

### gmail_create_draft
Create an email draft.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'gmail_create_draft',
  parameters: {
    to: 'recipient@example.com',
    subject: 'Draft Subject',
    body: 'Draft content...',
  },
});
```

## Setup Guide

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the Gmail API

### 2. Configure OAuth Consent Screen

1. Navigate to "APIs & Services" → "OAuth consent screen"
2. Add required scopes
3. For Gmail, Google may require app verification

### 3. Create OAuth Credentials

1. Navigate to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Add redirect URI: `https://your-domain.com/api/v1/oauth/callback/gmail`

### 4. Configure in Authlane

```typescript
await authlane.services.configure({
  serviceId: 'gmail',
  clientId: 'your-client-id.apps.googleusercontent.com',
  clientSecret: 'your-client-secret',
});
```

## Gmail Query Language

Gmail supports a powerful search query language:

```typescript
// Unread emails from a sender
query: "from:boss@company.com is:unread"

// Emails with attachments
query: "has:attachment"

// Emails in date range
query: "after:2025/01/01 before:2025/01/15"

// Emails by subject
query: "subject:meeting"

// Emails by label
query: "label:important"
```

## Important Notes

### User "me"

Use `me` as the user ID to reference the authenticated user:
```
/gmail/v1/users/me/messages
```

### Message Format

Gmail messages are base64url encoded. The API handles encoding/decoding automatically.

### Rate Limits

Gmail API has strict rate limits. Implement backoff for high-volume operations.

## Links

- [Gmail API Documentation](https://developers.google.com/gmail)
- [API Reference](https://developers.google.com/gmail/api/reference/rest)
- [Search Operators](https://support.google.com/mail/answer/7190)

