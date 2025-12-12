# Get Credentials

Retrieve decrypted credentials for a user's service connection.

## Endpoint

```
GET /api/v1/users/:userId/connections/:serviceId/credentials
```

## Authentication

- **API Key**: Required
- **Session**: Allowed (dashboard access)

## Parameters

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | External user ID |
| `serviceId` | string | Yes | Service identifier (e.g., "github") |

## Response

### Success (200)

```json
{
  "data": {
    "access_token": "ghp_xxxxxxxxxxxxxxxxxxxx",
    "refresh_token": "ghr_xxxxxxxxxxxxxxxxxxxx",
    "token_type": "bearer",
    "scope": "repo user read:org",
    "expires_at": "2024-12-12T11:30:00Z"
  },
  "error": null
}
```

### Error - Connection Not Found (404)

```json
{
  "data": null,
  "error": {
    "message": "Connection not found",
    "code": "CONNECTION_NOT_FOUND",
    "hint": "The user hasn't connected this service yet",
    "statusCode": 404
  }
}
```

### Error - Connection Expired (400)

```json
{
  "data": null,
  "error": {
    "message": "Connection expired",
    "code": "CONNECTION_EXPIRED",
    "hint": "The user needs to reconnect this service",
    "statusCode": 400
  }
}
```

## Examples

### cURL

```bash
curl -H "Authorization: Bearer ak_..." \
  "https://api.authlane.com/api/v1/users/user_456/connections/github/credentials"
```

### TypeScript SDK

```typescript
const { data, error } = await authlane.connections.getCredentials({
  userId: 'user_456',
  serviceId: 'github',
});

if (error) {
  if (error.code === 'CONNECTION_NOT_FOUND') {
    // Prompt user to connect
    showConnectPrompt('github');
  } else if (error.code === 'CONNECTION_EXPIRED') {
    // Prompt user to reconnect
    showReconnectPrompt('github');
  }
  return;
}

// Use the access token
const githubResponse = await fetch('https://api.github.com/user', {
  headers: {
    Authorization: `Bearer ${data.access_token}`,
  },
});
```

### Using Credentials to Call External API

```typescript
async function getGitHubRepos(userId: string) {
  // Get credentials from Authlane
  const { data: creds, error } = await authlane.connections.getCredentials({
    userId,
    serviceId: 'github',
  });

  if (error) throw new Error(error.message);

  // Call GitHub API directly
  const response = await fetch('https://api.github.com/user/repos', {
    headers: {
      Authorization: `Bearer ${creds.access_token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  return response.json();
}
```

## Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `access_token` | string | OAuth access token |
| `refresh_token` | string | OAuth refresh token (if available) |
| `token_type` | string | Token type (usually "bearer") |
| `scope` | string | Granted OAuth scopes |
| `expires_at` | string | Token expiration (ISO 8601) |
| `id_token` | string | OpenID Connect ID token (if available) |

## Automatic Token Refresh

If the access token is expired but a refresh token is available, Authlane will automatically:

1. Use the refresh token to get a new access token
2. Update the stored credentials
3. Return the fresh access token

This happens transparently - you'll receive a valid token.

If refresh fails (e.g., refresh token revoked), you'll get a `CONNECTION_EXPIRED` error.

## Security Considerations

- **Audit logging**: All credential access is logged
- **Rate limited**: More restrictive than other endpoints (60/min)
- **No caching**: Always returns fresh (possibly refreshed) credentials
- **HTTPS only**: Never transmit over unencrypted connections
- **Don't store**: Use credentials immediately, don't persist client-side

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `CONNECTION_NOT_FOUND` | 404 | User hasn't connected this service |
| `CONNECTION_EXPIRED` | 400 | Token expired and refresh failed |
| `SERVICE_NOT_FOUND` | 404 | Invalid service ID |
| `UNAUTHORIZED` | 401 | Invalid API key |
| `ENCRYPTION_ERROR` | 500 | Failed to decrypt credentials |
