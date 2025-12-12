# connections Table

End-user connections to third-party services.

## Overview

The `connections` table stores OAuth tokens, API keys, and connection metadata for users connecting external services through Authlane.

## Schema Definition

```typescript
// packages/database/src/schema/connections.ts
export const connections = pgTable(
  'connections',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    scope: connectionScopeEnum('scope').notNull().default('user'),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').references(() => organization.id, { onDelete: 'cascade' }),
    externalUserId: text('external_user_id'),
    serviceId: text('service_id').references(() => services.id, { onDelete: 'cascade' }).notNull(),
    status: text('status', { enum: ['pending', 'connected', 'expired', 'error'] }).default('pending').notNull(),
    credentialsEnc: text('credentials_enc'),
    metadata: jsonb('metadata').default({}).notNull(),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueUserService: unique('unique_user_service').on(table.userId, table.serviceId),
    uniqueOrgService: unique('unique_org_service').on(table.organizationId, table.serviceId),
  })
);
```

## Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | No | UUID | Primary key |
| `scope` | enum | No | 'user' | Connection ownership scope |
| `user_id` | text | Yes | - | User owner (for user scope) |
| `organization_id` | text | Yes | - | Organization owner (for org scope) |
| `external_user_id` | text | Yes | - | External app's user identifier |
| `service_id` | text | No | - | Connected service ID |
| `status` | text | No | 'pending' | Connection status |
| `credentials_enc` | text | Yes | - | Encrypted OAuth credentials |
| `metadata` | jsonb | No | {} | Additional metadata |
| `connected_at` | timestamp | Yes | - | When connection was established |
| `expires_at` | timestamp | Yes | - | When tokens expire |
| `created_at` | timestamp | No | now() | Record creation time |

## Enums

### connection_scope

```sql
CREATE TYPE "connection_scope" AS ENUM ('user', 'organization');
```

| Value | Description |
|-------|-------------|
| `user` | Owned by individual user |
| `organization` | Shared across organization |

### status

| Value | Description |
|-------|-------------|
| `pending` | OAuth flow initiated but not completed |
| `connected` | Successfully connected with valid tokens |
| `expired` | Access token expired (needs refresh) |
| `error` | Connection in error state |

## Foreign Keys

| Column | References | On Delete |
|--------|------------|-----------|
| `user_id` | user.id | CASCADE |
| `organization_id` | organization.id | CASCADE |
| `service_id` | services.id | CASCADE |

## Unique Constraints

| Name | Columns | Purpose |
|------|---------|---------|
| `unique_user_service` | (user_id, service_id) | One connection per user-service pair |
| `unique_org_service` | (organization_id, service_id) | One connection per org-service pair |

## Encrypted Credentials Format

The `credentials_enc` column stores AES-256-GCM encrypted JSON:

```typescript
interface Credentials {
  access_token: string;
  refresh_token?: string;
  token_type: string;       // Usually "bearer"
  scope?: string;           // OAuth scopes granted
  expires_at?: string;      // ISO 8601 timestamp
  id_token?: string;        // OpenID Connect token
}
```

**Encryption:**
```
plaintext JSON → AES-256-GCM encrypt → Base64 encode → store
```

## Metadata Schema

The `metadata` JSONB column stores:

### During OAuth Flow

```typescript
interface OAuthFlowMetadata {
  state: string;              // CSRF protection token
  pkce_code_verifier: string; // PKCE verifier
  redirect_uri: string;       // Where to redirect after OAuth
}
```

### After Connection

```typescript
interface ConnectionMetadata {
  account_id?: string;        // ID at external service
  account_name?: string;      // Name at external service
  account_email?: string;     // Email at external service
  raw_token_response?: any;   // Full OAuth response (for debugging)
}
```

## Common Queries

### List User's Connections

```typescript
const userConnections = await db.query.connections.findMany({
  where: and(
    eq(connections.organizationId, orgId),
    eq(connections.externalUserId, externalUserId),
    eq(connections.status, 'connected'),
  ),
  with: {
    service: true,
  },
});
```

### Get Connection with Decrypted Credentials

```typescript
const connection = await db.query.connections.findFirst({
  where: and(
    eq(connections.id, connectionId),
    eq(connections.organizationId, orgId),
  ),
});

if (connection?.credentialsEnc) {
  const credentials = decrypt(connection.credentialsEnc);
  // Use credentials...
}
```

### Create Pending Connection

```typescript
const [connection] = await db.insert(connections).values({
  scope: 'user',
  organizationId: orgId,
  externalUserId: userId,
  serviceId: 'github',
  status: 'pending',
  metadata: {
    state: generateState(),
    pkce_code_verifier: generatePkce(),
    redirect_uri: callbackUrl,
  },
}).returning();
```

### Update Connection After OAuth

```typescript
await db.update(connections)
  .set({
    status: 'connected',
    credentialsEnc: encrypt(JSON.stringify(tokens)),
    connectedAt: new Date(),
    expiresAt: tokens.expires_at ? new Date(tokens.expires_at) : null,
    metadata: {
      account_id: userInfo.id,
      account_name: userInfo.name,
    },
  })
  .where(eq(connections.id, connectionId));
```

### Find Expiring Connections

```typescript
const expiringConnections = await db.query.connections.findMany({
  where: and(
    eq(connections.status, 'connected'),
    lt(connections.expiresAt, new Date(Date.now() + 5 * 60 * 1000)), // Next 5 minutes
  ),
});
```

### Delete Connection

```typescript
await db.delete(connections)
  .where(and(
    eq(connections.id, connectionId),
    eq(connections.organizationId, orgId),
  ));
```

## TypeScript Types

```typescript
import { Connection, NewConnection, ConnectionStatus, ConnectionScope } from '@authlane/database';

// Select type
const conn: Connection = {
  id: 'uuid',
  scope: 'user',
  userId: 'user_123',
  organizationId: 'org_456',
  externalUserId: 'ext_789',
  serviceId: 'github',
  status: 'connected',
  credentialsEnc: 'encrypted...',
  metadata: { account_id: '12345' },
  connectedAt: new Date(),
  expiresAt: new Date(),
  createdAt: new Date(),
};

// Insert type
const newConn: NewConnection = {
  serviceId: 'github',
  organizationId: 'org_456',
  status: 'pending',
};
```

## Status Transitions

```
                    ┌─────────────┐
                    │   pending   │
                    └──────┬──────┘
                           │
              OAuth complete / Token exchange
                           │
                    ┌──────▼──────┐
          ┌─────────│  connected  │─────────┐
          │         └──────┬──────┘         │
          │                │                │
    Refresh failed   Token expired   Manual disconnect
          │                │                │
          ▼                ▼                ▼
    ┌──────────┐    ┌──────────┐     (deleted)
    │  error   │    │ expired  │
    └──────────┘    └────┬─────┘
                         │
                   Refresh success
                         │
                    ┌────▼─────┐
                    │connected │
                    └──────────┘
```

## Indexes (Recommended)

```sql
CREATE INDEX idx_connections_org ON connections(organization_id);
CREATE INDEX idx_connections_user ON connections(user_id);
CREATE INDEX idx_connections_external_user ON connections(external_user_id);
CREATE INDEX idx_connections_status ON connections(status);
CREATE INDEX idx_connections_expires_at ON connections(expires_at) WHERE status = 'connected';
```

## Security Considerations

1. **Credentials are encrypted** - Never log or expose `credentialsEnc` in plaintext
2. **PKCE verifier is sensitive** - Delete from metadata after OAuth completes
3. **State token is single-use** - Validate and remove after callback
4. **Always filter by organization** - Prevent cross-tenant access
