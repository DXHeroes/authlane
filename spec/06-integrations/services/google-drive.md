# Google Drive Integration

Connect to Google Drive for file storage and document management.

## Overview

| Property | Value |
|----------|-------|
| **Service ID** | `google-drive` |
| **Name** | Google Drive |
| **Auth Type** | OAuth 2.0 |
| **Documentation** | [Google Drive API](https://developers.google.com/drive) |

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
| `https://www.googleapis.com/auth/drive` | Full Drive access |
| `https://www.googleapis.com/auth/drive.file` | Access to files created by app |
| `https://www.googleapis.com/auth/drive.readonly` | Read-only access |
| `https://www.googleapis.com/auth/drive.metadata` | Read/write metadata only |
| `https://www.googleapis.com/auth/drive.metadata.readonly` | Read metadata only |
| `https://www.googleapis.com/auth/drive.appdata` | Access app-specific data |

### Default Scopes

```yaml
- https://www.googleapis.com/auth/drive.file
- https://www.googleapis.com/auth/drive.readonly
```

## Connection Example

```typescript
// Start OAuth flow
const { data } = await authlane.oauth.authorize({
  userId: 'user_123',
  serviceId: 'google-drive',
  scopes: [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.readonly',
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
  serviceId: 'google-drive',
});

// List files
const response = await fetch(
  'https://www.googleapis.com/drive/v3/files?' +
    new URLSearchParams({
      pageSize: '10',
      fields: 'files(id, name, mimeType, modifiedTime)',
    }),
  {
    headers: {
      Authorization: `Bearer ${creds.access_token}`,
    },
  }
);
```

## Available Tools

### google_drive_list_files
List files in Drive.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'google_drive_list_files',
  parameters: {
    query: "mimeType='application/pdf'",
    pageSize: 25,
    orderBy: 'modifiedTime desc',
  },
});
```

### google_drive_search
Search for files by name or content.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'google_drive_search',
  parameters: {
    query: 'report',
    mimeType: 'application/vnd.google-apps.document',
  },
});
```

### google_drive_get_file
Get file metadata and content.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'google_drive_get_file',
  parameters: {
    fileId: '1abc123...',
    includeContent: true,
  },
});
```

### google_drive_create_file
Create a new file.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'google_drive_create_file',
  parameters: {
    name: 'Meeting Notes.txt',
    content: 'Notes from today...',
    mimeType: 'text/plain',
    parents: ['folder-id'], // Optional folder
  },
});
```

## Setup Guide

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the Google Drive API

### 2. Configure OAuth Consent Screen

1. Navigate to "APIs & Services" → "OAuth consent screen"
2. Choose user type
3. Add required scopes
4. Add test users (if external)

### 3. Create OAuth Credentials

1. Navigate to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Add redirect URI: `https://your-domain.com/api/v1/oauth/callback/google-drive`

### 4. Configure in Authlane

```typescript
await authlane.services.configure({
  serviceId: 'google-drive',
  clientId: 'your-client-id.apps.googleusercontent.com',
  clientSecret: 'your-client-secret',
});
```

## Query Language

Google Drive supports a query language for searching:

```typescript
// Find PDFs modified this week
query: "mimeType='application/pdf' and modifiedTime > '2025-01-08'"

// Find files in a folder
query: "'folder-id' in parents"

// Find files by name
query: "name contains 'report'"

// Find shared files
query: "sharedWithMe"
```

## MIME Types

Common Google Drive MIME types:

| Type | MIME Type |
|------|-----------|
| Google Doc | `application/vnd.google-apps.document` |
| Google Sheet | `application/vnd.google-apps.spreadsheet` |
| Google Slides | `application/vnd.google-apps.presentation` |
| Folder | `application/vnd.google-apps.folder` |

## Links

- [Google Drive API Documentation](https://developers.google.com/drive)
- [API Reference](https://developers.google.com/drive/api/v3/reference)
- [Search Query Terms](https://developers.google.com/drive/api/v3/search-files)

