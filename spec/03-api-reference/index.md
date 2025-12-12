# API Reference

Complete documentation of the Authlane REST API.

## Contents

- [Authentication](./authentication.md) - API authentication methods
- [Error Handling](./error-handling.md) - Error response format
- [Rate Limiting](./rate-limiting.md) - Rate limits and throttling

### Endpoints

- **Services**
  - [List Services](./endpoints/services/list-services.md) - Retrieve all available services
  - [Get Service](./endpoints/services/get-service.md) - Get service details and tools

- **Connections**
  - [List Connections](./endpoints/connections/list-connections.md) - List user's service connections
  - [Get Credentials](./endpoints/connections/get-credentials.md) - Retrieve OAuth credentials
  - [Health Check](./endpoints/connections/health-check.md) - Check connection status
  - [Delete Connection](./endpoints/connections/delete-connection.md) - Remove a connection

- **OAuth**
  - [Authorize](./endpoints/oauth/authorize.md) - Start OAuth 2.0 flow
  - [Callback](./endpoints/oauth/callback.md) - Handle OAuth callback

- **Tools**
  - [List Tools](./endpoints/tools/list-tools.md) - Get tool definitions
  - [Execute Tool](./endpoints/tools/execute-tool.md) - Execute a tool

- **Dashboard**
  - [Stats](./endpoints/dashboard/stats.md) - Usage statistics
  - [API Keys](./endpoints/dashboard/api-keys.md) - Manage API keys
  - [Organization Settings](./endpoints/dashboard/organization-settings.md) - Manage organization
  - [Organization Services](./endpoints/dashboard/organization-services.md) - Configure services
  - [Members](./endpoints/dashboard/members.md) - Manage team members

### OpenAPI Specification

- [OpenAPI v1 YAML](./openapi/openapi-v1.yaml)

## Base URL

| Environment | Base URL |
|-------------|----------|
| Production | `https://api.authlane.com` |
| Staging | `https://staging.api.authlane.com` |
| Local | `http://localhost:3000` |

## API Versioning

The API is versioned via URL path:

```
/api/v1/...
```

Breaking changes will increment the version number. Non-breaking additions may be added to existing versions.

## Request Format

### Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes* | API key or session token |
| `Content-Type` | For POST/PUT | `application/json` |
| `Accept` | No | `application/json` (default) |

*Not required for public endpoints like `/health`

### Authentication

```bash
# API Key (Bearer)
curl -H "Authorization: Bearer ak_xxx" ...

# API Key (ApiKey)
curl -H "Authorization: ApiKey ak_xxx" ...

# Session (Cookie)
curl -b "session=..." ...
```

## Response Format

All responses follow the Supabase-style format:

### Success Response

```json
{
  "data": { ... },
  "error": null
}
```

### Error Response

```json
{
  "data": null,
  "error": {
    "message": "Human-readable error message",
    "code": "ERROR_CODE",
    "hint": "How to fix this error",
    "docUrl": "https://docs.authlane.com/errors/ERROR_CODE",
    "statusCode": 400
  }
}
```

## Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation failed) |
| 401 | Unauthorized (auth required) |
| 403 | Forbidden (no permission) |
| 404 | Not Found |
| 429 | Rate Limited |
| 500 | Internal Server Error |

## Pagination

List endpoints support pagination:

```
GET /api/v1/connections?limit=20&offset=0
```

| Parameter | Default | Max | Description |
|-----------|---------|-----|-------------|
| `limit` | 20 | 100 | Items per page |
| `offset` | 0 | - | Items to skip |

Response includes pagination metadata:

```json
{
  "data": {
    "items": [...],
    "pagination": {
      "total": 150,
      "limit": 20,
      "offset": 0,
      "hasMore": true
    }
  }
}
```

## Filtering

Some endpoints support filtering:

```
GET /api/v1/connections?status=connected&serviceId=github
```

Supported filters vary by endpoint - see individual documentation.

## Rate Limits

| Plan | Requests/min | Requests/hour |
|------|--------------|---------------|
| Free | 100 | 1,000 |
| Pro | 500 | 10,000 |
| Enterprise | Custom | Custom |

Rate limit headers are included in all responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1702459200
```

## Endpoint Summary

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |

### Services

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/services` | List all services |
| GET | `/api/v1/services/:serviceId` | Get service details |

### Connections

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/users/:userId/connections` | List connections |
| GET | `/api/v1/users/:userId/connections/:serviceId/credentials` | Get credentials |
| GET | `/api/v1/users/:userId/connections/:serviceId/health` | Check connection health |
| DELETE | `/api/v1/users/:userId/connections/:serviceId` | Delete connection |

### OAuth

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/users/:userId/connections/:serviceId/authorize` | Start OAuth flow |
| GET | `/api/v1/oauth/callback` | Handle OAuth callback |

### Tools

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/users/:userId/tools` | List available tools |
| POST | `/api/v1/users/:userId/tools/:toolName/execute` | Execute a tool |

### Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/dashboard/stats` | Dashboard statistics |
| GET | `/api/v1/dashboard/api-keys` | List API keys |
| POST | `/api/v1/dashboard/api-keys` | Create API key |
| DELETE | `/api/v1/dashboard/api-keys/:keyId` | Delete API key |
| PATCH | `/api/v1/dashboard/api-keys/:keyId` | Update API key |
| GET | `/api/v1/dashboard/organization` | Get organization |
| PATCH | `/api/v1/dashboard/organization` | Update organization |
| DELETE | `/api/v1/dashboard/organization` | Delete organization |
| GET | `/api/v1/dashboard/organization/services` | List org services |
| GET | `/api/v1/dashboard/organization/services/:serviceId` | Get org service config |
| PUT | `/api/v1/dashboard/organization/services/:serviceId` | Update org service config |
| GET | `/api/v1/dashboard/organization/members` | List members |
| POST | `/api/v1/dashboard/organization/members/invite` | Invite member |
| PATCH | `/api/v1/dashboard/organization/members/:memberId` | Update member role |
| DELETE | `/api/v1/dashboard/organization/members/:memberId` | Remove member |

## SDK Usage

For type-safe API access, use the official SDK:

```typescript
import { Authlane } from '@authlane/sdk';

const authlane = new Authlane({
  apiKey: 'ak_...',
  baseUrl: 'https://api.authlane.com',
});

const { data, error } = await authlane.connections.list({
  userId: 'user_123',
});
```

See [SDK Documentation](../05-sdk/) for details.
