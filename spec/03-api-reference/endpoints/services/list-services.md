# List Services

Retrieve a list of all available services for connection.

## Endpoint

```
GET /api/v1/services
```

## Authentication

- **API Key**: Required
- **Session**: Allowed
- **Public**: Yes (returns global services only)

## Parameters

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `enabled` | boolean | No | Filter by enabled status |
| `authType` | string | No | Filter by auth type (oauth2, api_key, none) |

## Response

### Success (200)

```json
{
  "data": {
    "items": [
      {
        "id": "github",
        "name": "GitHub",
        "authType": "oauth2",
        "enabled": true,
        "config": {
          "authorization_url": "https://github.com/login/oauth/authorize",
          "token_url": "https://github.com/login/oauth/access_token",
          "scopes": ["repo", "user", "read:org"],
          "base_url": "https://api.github.com",
          "documentation_url": "https://docs.github.com/en/rest",
          "icon": "https://github.githubassets.com/favicons/favicon.svg",
          "color": "#24292e",
          "description": "Repositories, issues, pull requests"
        }
      },
      {
        "id": "slack",
        "name": "Slack",
        "authType": "oauth2",
        "enabled": true,
        "config": {
          "authorization_url": "https://slack.com/oauth/v2/authorize",
          "token_url": "https://slack.com/api/oauth.v2.access",
          "scopes": ["channels:read", "chat:write"],
          "base_url": "https://slack.com/api",
          "description": "Messages, channels, users"
        }
      }
    ],
    "total": 15
  },
  "error": null
}
```

## Examples

### cURL

```bash
# List all services
curl -H "Authorization: Bearer ak_..." \
  https://api.authlane.com/api/v1/services

# Filter OAuth services only
curl -H "Authorization: Bearer ak_..." \
  "https://api.authlane.com/api/v1/services?authType=oauth2"
```

### TypeScript SDK

```typescript
const { data, error } = await authlane.services.list();

if (error) {
  console.error(error.message);
  return;
}

for (const service of data.items) {
  console.log(`${service.name} (${service.authType})`);
}
```

### JavaScript (fetch)

```javascript
const response = await fetch('https://api.authlane.com/api/v1/services', {
  headers: {
    'Authorization': `Bearer ${apiKey}`,
  },
});

const { data, error } = await response.json();
```

## Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Service identifier (e.g., "github") |
| `name` | string | Display name |
| `authType` | string | Authentication type |
| `enabled` | boolean | Whether service is globally enabled |
| `config` | object | Service configuration |
| `config.authorization_url` | string | OAuth authorization URL |
| `config.token_url` | string | OAuth token URL |
| `config.scopes` | string[] | Default OAuth scopes |
| `config.base_url` | string | API base URL |
| `config.documentation_url` | string | Developer docs URL |
| `config.icon` | string | Service icon URL |
| `config.color` | string | Brand color (hex) |
| `config.description` | string | Short description |

## Notes

- Services disabled globally will not appear
- Organization-specific enable/disable status is not reflected here
- For organization-specific service status, use the dashboard API
