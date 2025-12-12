# Get Service

Retrieve details for a specific service.

## Endpoint

```
GET /api/v1/services/:serviceId
```

## Authentication

- **API Key**: Required
- **Session**: Allowed
- **Public**: Yes (returns public service info only)

## Parameters

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `serviceId` | string | Yes | Service identifier (e.g., "github") |

## Response

### Success (200)

```json
{
  "data": {
    "id": "github",
    "name": "GitHub",
    "authType": "oauth2",
    "enabled": true,
    "config": {
      "authorization_url": "https://github.com/login/oauth/authorize",
      "token_url": "https://github.com/login/oauth/access_token",
      "scopes": ["repo", "user", "read:org"],
      "default_scopes": ["repo", "user"],
      "base_url": "https://api.github.com",
      "documentation_url": "https://docs.github.com/en/rest",
      "icon": "https://github.githubassets.com/favicons/favicon.svg",
      "color": "#24292e",
      "description": "Repositories, issues, pull requests"
    },
    "tools": [
      {
        "name": "github_create_issue",
        "description": "Creates a new issue in a GitHub repository"
      },
      {
        "name": "github_list_repos",
        "description": "List repositories for the authenticated user"
      }
    ]
  },
  "error": null
}
```

### Error - Service Not Found (404)

```json
{
  "data": null,
  "error": {
    "message": "Service not found",
    "code": "SERVICE_NOT_FOUND",
    "hint": "Check the service ID",
    "statusCode": 404
  }
}
```

## Examples

### cURL

```bash
curl -H "Authorization: Bearer ak_..." \
  "https://api.authlane.com/api/v1/services/github"
```

### TypeScript SDK

```typescript
const { data, error } = await authlane.services.get({
  serviceId: 'github',
});

if (error) {
  console.error(error.message);
  return;
}

console.log(`${data.name} - ${data.config.description}`);
console.log(`Available tools: ${data.tools.length}`);
```

### Display Service Details

```typescript
function ServiceDetails({ serviceId }: { serviceId: string }) {
  const [service, setService] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authlane.services
      .get({ serviceId })
      .then(({ data }) => setService(data))
      .finally(() => setLoading(false));
  }, [serviceId]);

  if (loading) return <Spinner />;
  if (!service) return <NotFound />;

  return (
    <div>
      <img src={service.config.icon} alt={service.name} />
      <h1>{service.name}</h1>
      <p>{service.config.description}</p>

      <h2>Available Scopes</h2>
      <ul>
        {service.config.scopes.map((scope) => (
          <li key={scope}>{scope}</li>
        ))}
      </ul>

      <h2>Available Tools ({service.tools.length})</h2>
      <ul>
        {service.tools.map((tool) => (
          <li key={tool.name}>
            <strong>{tool.name}</strong>: {tool.description}
          </li>
        ))}
      </ul>

      <a
        href={service.config.documentation_url}
        target="_blank"
        rel="noopener"
      >
        View API Documentation
      </a>
    </div>
  );
}
```

## Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Service identifier |
| `name` | string | Display name |
| `authType` | string | Authentication type (oauth2, api_key, none) |
| `enabled` | boolean | Whether service is enabled |
| `config` | object | Service configuration |
| `tools` | array | Available tools (summary only) |

### Config Fields

| Field | Type | Description |
|-------|------|-------------|
| `authorization_url` | string | OAuth authorization URL |
| `token_url` | string | OAuth token URL |
| `scopes` | string[] | All available OAuth scopes |
| `default_scopes` | string[] | Default requested scopes |
| `base_url` | string | API base URL |
| `documentation_url` | string | Developer documentation URL |
| `icon` | string | Service icon URL |
| `color` | string | Brand color (hex) |
| `description` | string | Short description |

### Tool Summary Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Tool identifier |
| `description` | string | What the tool does |

## Auth Types

| Type | Description | Example Services |
|------|-------------|------------------|
| `oauth2` | OAuth 2.0 flow | GitHub, Slack, Google |
| `api_key` | API key authentication | SendGrid, Stripe |
| `none` | No authentication needed | Public APIs |

## Notes

- Tool details (input schemas) are not included; use the tools endpoint
- Organization-specific configuration is not reflected
- Service availability may vary by plan

