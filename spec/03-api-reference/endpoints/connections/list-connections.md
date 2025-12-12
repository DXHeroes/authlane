# List Connections

Retrieve all connections for a specific user.

## Endpoint

```
GET /api/v1/users/:userId/connections
```

## Authentication

- **API Key**: Required
- **Session**: Allowed

## Parameters

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | External user ID |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | No | Filter by status (pending, connected, expired, error) |
| `serviceId` | string | No | Filter by service |
| `limit` | number | No | Max results (default: 20, max: 100) |
| `offset` | number | No | Pagination offset |

## Response

### Success (200)

```json
{
  "data": {
    "items": [
      {
        "id": "conn_abc123",
        "scope": "user",
        "userId": "usr_xyz",
        "organizationId": "org_123",
        "externalUserId": "user_456",
        "serviceId": "github",
        "status": "connected",
        "metadata": {
          "account_id": "12345678",
          "account_name": "johndoe"
        },
        "connectedAt": "2024-12-10T10:30:00Z",
        "expiresAt": "2024-12-17T10:30:00Z",
        "createdAt": "2024-12-10T10:29:00Z"
      },
      {
        "id": "conn_def456",
        "scope": "user",
        "userId": "usr_xyz",
        "organizationId": "org_123",
        "externalUserId": "user_456",
        "serviceId": "slack",
        "status": "connected",
        "metadata": {},
        "connectedAt": "2024-12-08T15:00:00Z",
        "expiresAt": null,
        "createdAt": "2024-12-08T14:59:00Z"
      }
    ],
    "pagination": {
      "total": 2,
      "limit": 20,
      "offset": 0,
      "hasMore": false
    }
  },
  "error": null
}
```

### Error (401)

```json
{
  "data": null,
  "error": {
    "message": "Authentication required",
    "code": "UNAUTHORIZED",
    "statusCode": 401
  }
}
```

## Examples

### cURL

```bash
# List all connections for user
curl -H "Authorization: Bearer ak_..." \
  "https://api.authlane.com/api/v1/users/user_456/connections"

# Filter by status
curl -H "Authorization: Bearer ak_..." \
  "https://api.authlane.com/api/v1/users/user_456/connections?status=connected"

# Filter by service
curl -H "Authorization: Bearer ak_..." \
  "https://api.authlane.com/api/v1/users/user_456/connections?serviceId=github"
```

### TypeScript SDK

```typescript
const { data, error } = await authlane.connections.list({
  userId: 'user_456',
  status: 'connected',
});

if (error) {
  console.error(error.message);
  return;
}

console.log(`User has ${data.items.length} connected services`);
```

## Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Connection ID |
| `scope` | string | "user" or "organization" |
| `userId` | string | Authlane user ID |
| `organizationId` | string | Organization ID |
| `externalUserId` | string | Your app's user ID |
| `serviceId` | string | Service identifier |
| `status` | string | Connection status |
| `metadata` | object | Additional connection data |
| `connectedAt` | string | ISO 8601 timestamp |
| `expiresAt` | string | Token expiration (null if no expiry) |
| `createdAt` | string | Record creation time |

## Connection Status

| Status | Description |
|--------|-------------|
| `pending` | OAuth flow started but not completed |
| `connected` | Successfully authenticated |
| `expired` | Token expired, needs refresh |
| `error` | Connection in error state |

## Notes

- Only connections belonging to the authenticated organization are returned
- Credentials are NOT included in list responses (use get-credentials endpoint)
- `externalUserId` is the user ID in YOUR system, not Authlane's internal ID
