# organization_services Table

Per-organization service configuration.

## Overview

The `organization_services` table allows organizations to customize service settings, including using their own OAuth applications, custom scopes, or API keys.

## Schema Definition

```typescript
// packages/database/src/schema/organization-services.ts
export const organizationServices = pgTable(
  'organization_services',
  {
    organizationId: text('organization_id')
      .references(() => organization.id, { onDelete: 'cascade' })
      .notNull(),
    serviceId: text('service_id')
      .references(() => services.id, { onDelete: 'cascade' })
      .notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    oauthClientId: text('oauth_client_id'),
    oauthClientSecretEnc: text('oauth_client_secret_enc'),
    customScopes: text('custom_scopes').array(),
    apiKeyEnc: text('api_key_enc'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organizationId, table.serviceId] }),
  })
);
```

## Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `organization_id` | text | No | - | Organization FK (part of PK) |
| `service_id` | text | No | - | Service FK (part of PK) |
| `enabled` | boolean | No | true | Service enabled for this org |
| `oauth_client_id` | text | Yes | - | Custom OAuth app client ID |
| `oauth_client_secret_enc` | text | Yes | - | Encrypted OAuth client secret |
| `custom_scopes` | text[] | Yes | - | Custom OAuth scopes |
| `api_key_enc` | text | Yes | - | Encrypted API key (for api_key auth) |
| `created_at` | timestamp | Yes | now() | Record creation time |
| `updated_at` | timestamp | Yes | now() | Last update time |

## Primary Key

Composite primary key: `(organization_id, service_id)`

## Foreign Keys

| Column | References | On Delete |
|--------|------------|-----------|
| `organization_id` | organization.id | CASCADE |
| `service_id` | services.id | CASCADE |

## Encrypted Fields

| Column | Content | Purpose |
|--------|---------|---------|
| `oauth_client_secret_enc` | OAuth 2.0 client secret | Custom OAuth app |
| `api_key_enc` | Service API key | API key authentication |

Both fields use AES-256-GCM encryption.

## Use Cases

### 1. Disable a Service

Organization doesn't want users connecting to a specific service:

```typescript
await db.insert(organizationServices).values({
  organizationId: orgId,
  serviceId: 'discord',
  enabled: false,
});
```

### 2. Use Custom OAuth Application

Organization wants to use their own GitHub OAuth app:

```typescript
await db.insert(organizationServices).values({
  organizationId: orgId,
  serviceId: 'github',
  enabled: true,
  oauthClientId: 'org_github_client_id',
  oauthClientSecretEnc: encrypt('org_github_client_secret'),
  customScopes: ['repo', 'user:email'], // Restricted scopes
});
```

### 3. Configure API Key Service

Organization provides their Stripe API key:

```typescript
await db.insert(organizationServices).values({
  organizationId: orgId,
  serviceId: 'stripe',
  enabled: true,
  apiKeyEnc: encrypt('sk_live_...')
});
```

## Common Queries

### Get Organization's Service Configuration

```typescript
const orgService = await db.query.organizationServices.findFirst({
  where: and(
    eq(organizationServices.organizationId, orgId),
    eq(organizationServices.serviceId, serviceId),
  ),
});
```

### List All Enabled Services for Organization

```typescript
// Get services with org config merged
const services = await db
  .select({
    id: services.id,
    name: services.name,
    authType: services.authType,
    config: services.config,
    globalEnabled: services.enabled,
    orgEnabled: organizationServices.enabled,
    hasCustomOAuth: organizationServices.oauthClientId,
    customScopes: organizationServices.customScopes,
  })
  .from(services)
  .leftJoin(
    organizationServices,
    and(
      eq(services.id, organizationServices.serviceId),
      eq(organizationServices.organizationId, orgId),
    ),
  )
  .where(
    and(
      eq(services.enabled, true),
      or(
        isNull(organizationServices.enabled),
        eq(organizationServices.enabled, true),
      ),
    ),
  );
```

### Enable/Disable Service

```typescript
// Enable
await db
  .insert(organizationServices)
  .values({
    organizationId: orgId,
    serviceId: serviceId,
    enabled: true,
  })
  .onConflictDoUpdate({
    target: [organizationServices.organizationId, organizationServices.serviceId],
    set: { enabled: true, updatedAt: new Date() },
  });

// Disable
await db
  .update(organizationServices)
  .set({ enabled: false, updatedAt: new Date() })
  .where(
    and(
      eq(organizationServices.organizationId, orgId),
      eq(organizationServices.serviceId, serviceId),
    ),
  );
```

### Update Custom OAuth Configuration

```typescript
await db
  .insert(organizationServices)
  .values({
    organizationId: orgId,
    serviceId: 'github',
    enabled: true,
    oauthClientId: clientId,
    oauthClientSecretEnc: encrypt(clientSecret),
    customScopes: scopes,
  })
  .onConflictDoUpdate({
    target: [organizationServices.organizationId, organizationServices.serviceId],
    set: {
      oauthClientId: clientId,
      oauthClientSecretEnc: encrypt(clientSecret),
      customScopes: scopes,
      updatedAt: new Date(),
    },
  });
```

## OAuth Credential Resolution

When starting an OAuth flow, credentials are resolved in this order:

```typescript
async function getOAuthCredentials(orgId: string, serviceId: string) {
  // 1. Check for organization-specific credentials
  const orgService = await db.query.organizationServices.findFirst({
    where: and(
      eq(organizationServices.organizationId, orgId),
      eq(organizationServices.serviceId, serviceId),
    ),
  });

  if (orgService?.oauthClientId && orgService?.oauthClientSecretEnc) {
    return {
      clientId: orgService.oauthClientId,
      clientSecret: decrypt(orgService.oauthClientSecretEnc),
      scopes: orgService.customScopes,
    };
  }

  // 2. Fall back to global/default credentials
  return {
    clientId: process.env[`${serviceId.toUpperCase()}_CLIENT_ID`],
    clientSecret: process.env[`${serviceId.toUpperCase()}_CLIENT_SECRET`],
    scopes: null, // Use default scopes from service config
  };
}
```

## TypeScript Types

```typescript
import { OrganizationService, NewOrganizationService } from '@authlane/database';

// Select type
const orgService: OrganizationService = {
  organizationId: 'org_123',
  serviceId: 'github',
  enabled: true,
  oauthClientId: 'custom_client_id',
  oauthClientSecretEnc: 'encrypted...',
  customScopes: ['repo', 'user:email'],
  apiKeyEnc: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Insert type
const newOrgService: NewOrganizationService = {
  organizationId: 'org_456',
  serviceId: 'slack',
  enabled: true,
};
```

## Security Considerations

1. **Encrypted secrets** - OAuth secrets and API keys are always encrypted
2. **Organization isolation** - Each org can only see/modify their own configs
3. **Cascading deletes** - Deleted when organization or service is deleted
4. **Audit logging** - Changes should be logged for security review
5. **Secret rotation** - Support updating secrets without downtime
