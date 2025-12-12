# services Table

Available third-party services that can be connected through Authlane.

## Overview

The `services` table defines all integrations available in Authlane - GitHub, Slack, Google services, CRMs, etc. Each service has its authentication configuration and metadata.

## Schema Definition

```typescript
// packages/database/src/schema/services.ts
export const services = pgTable('services', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  authType: text('auth_type').notNull(),
  config: jsonb('config').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
});
```

## Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | No | - | Service identifier (e.g., "github") |
| `name` | text | No | - | Display name |
| `auth_type` | text | No | - | Authentication type |
| `config` | jsonb | No | - | Service configuration |
| `enabled` | boolean | No | true | Global enable/disable |

## Authentication Types

| auth_type | Description | Config Required |
|-----------|-------------|-----------------|
| `oauth2` | OAuth 2.0 flow | authorization_url, token_url |
| `oauth1` | OAuth 1.0a flow | request_token_url, access_token_url |
| `api_key` | API key authentication | header_name, header_format |
| `header` | Custom header authentication | header_name |
| `none` | Public API (no auth) | - |

## Config Schema

### OAuth 2.0 Services

```typescript
interface OAuth2Config {
  authorization_url: string;     // OAuth authorization endpoint
  token_url: string;             // Token exchange endpoint
  scopes: string[];              // Default OAuth scopes
  pkce?: boolean;                // PKCE support (default: true)
  token_endpoint_auth_method?: string; // client_secret_post, client_secret_basic

  // UI Configuration
  base_url?: string;             // API base URL
  documentation_url?: string;    // Developer docs link
  icon?: string;                 // Service icon URL
  color?: string;                // Brand color (hex)
  description?: string;          // Service description

  // Advanced
  user_info_url?: string;        // URL to fetch user info
  revoke_url?: string;           // Token revocation endpoint
}
```

### API Key Services

```typescript
interface ApiKeyConfig {
  base_url: string;
  header_name: string;           // e.g., "X-API-Key"
  header_format?: string;        // e.g., "Bearer {key}" or just "{key}"
  documentation_url?: string;

  // UI Configuration
  icon?: string;
  color?: string;
  description?: string;
}
```

### Public API Services

```typescript
interface PublicApiConfig {
  base_url: string;
  documentation_url?: string;

  // UI Configuration
  icon?: string;
  description?: string;
}
```

## Service Examples

### GitHub (OAuth 2.0)

```typescript
{
  id: 'github',
  name: 'GitHub',
  authType: 'oauth2',
  enabled: true,
  config: {
    authorization_url: 'https://github.com/login/oauth/authorize',
    token_url: 'https://github.com/login/oauth/access_token',
    scopes: ['repo', 'user', 'read:org'],
    base_url: 'https://api.github.com',
    documentation_url: 'https://docs.github.com/en/rest',
    icon: 'https://github.githubassets.com/favicons/favicon.svg',
    color: '#24292e',
    description: 'Repositories, issues, pull requests',
  },
}
```

### Stripe (API Key)

```typescript
{
  id: 'stripe',
  name: 'Stripe',
  authType: 'api_key',
  enabled: true,
  config: {
    base_url: 'https://api.stripe.com/v1',
    header_name: 'Authorization',
    header_format: 'Bearer {key}',
    documentation_url: 'https://stripe.com/docs/api',
    icon: 'https://stripe.com/favicon.ico',
    color: '#635BFF',
    description: 'Payments, customers, subscriptions',
  },
}
```

### JSONPlaceholder (Public)

```typescript
{
  id: 'jsonplaceholder',
  name: 'JSONPlaceholder',
  authType: 'none',
  enabled: true,
  config: {
    base_url: 'https://jsonplaceholder.typicode.com',
    documentation_url: 'https://jsonplaceholder.typicode.com/guide',
    description: 'Fake REST API for testing',
  },
}
```

## Common Queries

### List All Enabled Services

```typescript
const enabledServices = await db.query.services.findMany({
  where: eq(services.enabled, true),
});
```

### Get Service by ID

```typescript
const github = await db.query.services.findFirst({
  where: eq(services.id, 'github'),
});
```

### List OAuth Services

```typescript
const oauthServices = await db.query.services.findMany({
  where: and(
    eq(services.authType, 'oauth2'),
    eq(services.enabled, true),
  ),
});
```

### Get Services for Organization

```typescript
// Services with org-specific configuration
const orgServices = await db
  .select({
    service: services,
    orgConfig: organizationServices,
  })
  .from(services)
  .leftJoin(
    organizationServices,
    and(
      eq(services.id, organizationServices.serviceId),
      eq(organizationServices.organizationId, orgId),
    ),
  )
  .where(eq(services.enabled, true));
```

## Relationships

| Related Table | Cardinality | Description |
|---------------|-------------|-------------|
| organization_services | 1:N | Per-org configurations |
| connection | 1:N | User connections |

## Seeding Services

Services are seeded during database initialization:

```typescript
// packages/database/src/seed.ts
const defaultServices = [
  {
    id: 'github',
    name: 'GitHub',
    authType: 'oauth2',
    config: { /* ... */ },
  },
  {
    id: 'slack',
    name: 'Slack',
    authType: 'oauth2',
    config: { /* ... */ },
  },
  // ... more services
];

await db.insert(services).values(defaultServices).onConflictDoNothing();
```

## TypeScript Types

```typescript
import { Service, NewService } from '@authlane/database';

// Select type
const service: Service = {
  id: 'github',
  name: 'GitHub',
  authType: 'oauth2',
  config: {
    authorization_url: 'https://...',
    token_url: 'https://...',
    scopes: ['repo'],
  },
  enabled: true,
};

// Insert type
const newService: NewService = {
  id: 'custom-service',
  name: 'Custom Service',
  authType: 'api_key',
  config: { base_url: 'https://...' },
};
```

## Adding New Services

To add a new service:

1. Create integration folder in `integrations/{service-id}/`
2. Add `config.yaml` with OAuth/API configuration
3. Add `tools.ts` with tool definitions
4. Run seed script or insert directly:

```typescript
await db.insert(services).values({
  id: 'new-service',
  name: 'New Service',
  authType: 'oauth2',
  config: {
    authorization_url: '...',
    token_url: '...',
    scopes: ['read', 'write'],
  },
  enabled: true,
});
```

## Global vs Organization Services

- **services** table: Global service definitions (all organizations)
- **organization_services** table: Per-org customization (enable/disable, custom OAuth)

An organization can:
1. Use global service with default settings
2. Enable/disable specific services
3. Provide custom OAuth credentials
4. Customize OAuth scopes
