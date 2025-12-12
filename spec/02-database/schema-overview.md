# Schema Overview

Complete documentation of the Authlane database schema.

## Tables Summary

| Table | Purpose | Records |
|-------|---------|---------|
| `user` | Authenticated system users | Users with dashboard access |
| `session` | Browser sessions | Active user sessions |
| `account` | OAuth provider accounts | Linked OAuth accounts |
| `organization` | Tenants/workspaces | Companies using Authlane |
| `member` | Organization membership | User-organization links |
| `invitation` | Pending invitations | Unaccepted invites |
| `services` | Available services | GitHub, Slack, etc. |
| `organization_services` | Org service config | Custom OAuth credentials |
| `connections` | User connections | OAuth tokens, API keys |

## Schema Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Authentication Domain                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐                       │
│  │   user   │──1:N─│ session  │      │ account  │                       │
│  └────┬─────┘      └──────────┘      └────┬─────┘                       │
│       │                                    │                             │
│       └────────────────┬───────────────────┘                            │
│                        │ 1:N                                             │
│                        ▼                                                 │
│                  ┌──────────┐                                            │
│                  │  member  │                                            │
│                  └────┬─────┘                                            │
│                       │ N:1                                              │
│                       ▼                                                  │
│  ┌────────────┐  ┌────────────┐                                         │
│  │ invitation │──│organization│                                         │
│  └────────────┘  └─────┬──────┘                                         │
│                        │                                                 │
└────────────────────────┼────────────────────────────────────────────────┘
                         │
┌────────────────────────┼────────────────────────────────────────────────┐
│                        │    Integration Domain                           │
├────────────────────────┼────────────────────────────────────────────────┤
│                        │                                                 │
│                        │ N:1                                             │
│  ┌─────────────────────▼─────────────────────┐                          │
│  │         organization_services              │                          │
│  │  (Custom OAuth credentials per org)        │                          │
│  └────────────────────┬──────────────────────┘                          │
│                       │ N:1                                              │
│                       ▼                                                  │
│                 ┌──────────┐                                             │
│                 │ services │                                             │
│                 └────┬─────┘                                             │
│                      │ 1:N                                               │
│                      ▼                                                   │
│               ┌─────────────┐                                            │
│               │ connections │                                            │
│               │ (Encrypted  │                                            │
│               │  tokens)    │                                            │
│               └─────────────┘                                            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Table Definitions

### user

Authenticated users with dashboard access.

```sql
CREATE TABLE "user" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "email_verified" boolean NOT NULL DEFAULT false,
  "image" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
```

### session

User sessions for cookie-based authentication.

```sql
CREATE TABLE "session" (
  "id" text PRIMARY KEY,
  "expires_at" timestamp with time zone NOT NULL,
  "token" text NOT NULL UNIQUE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "ip_address" text,
  "user_agent" text,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "active_organization_id" text
);
```

### account

OAuth provider accounts linked to users.

```sql
CREATE TABLE "account" (
  "id" text PRIMARY KEY,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamp with time zone,
  "refresh_token_expires_at" timestamp with time zone,
  "scope" text,
  "password" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
```

### organization

Organizations (tenants) using Authlane.

```sql
CREATE TABLE "organization" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "logo" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "metadata" text  -- JSON: apiKeys, webhookUrl, settings
);
```

### member

Organization membership (user-organization relationship).

```sql
CREATE TABLE "member" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'member',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
```

### invitation

Pending organization invitations.

```sql
CREATE TABLE "invitation" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "role" text NOT NULL DEFAULT 'member',
  "status" text NOT NULL DEFAULT 'pending',
  "expires_at" timestamp with time zone NOT NULL,
  "inviter_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
```

### services

Available third-party services.

```sql
CREATE TABLE "services" (
  "id" text PRIMARY KEY,  -- e.g., "github", "slack"
  "name" text NOT NULL,
  "auth_type" text NOT NULL,  -- "oauth2", "api_key", "header", "none"
  "config" jsonb NOT NULL,    -- OAuth URLs, scopes, etc.
  "enabled" boolean NOT NULL DEFAULT true
);
```

### organization_services

Per-organization service configuration.

```sql
CREATE TABLE "organization_services" (
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "service_id" text NOT NULL REFERENCES "services"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL DEFAULT true,
  "oauth_client_id" text,
  "oauth_client_secret_enc" text,  -- Encrypted
  "custom_scopes" text[],
  "api_key_enc" text,              -- Encrypted
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  PRIMARY KEY ("organization_id", "service_id")
);
```

### connections

User/organization connections to services.

```sql
CREATE TYPE "connection_scope" AS ENUM ('user', 'organization');

CREATE TABLE "connections" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid(),
  "scope" connection_scope NOT NULL DEFAULT 'user',
  "user_id" text REFERENCES "user"("id") ON DELETE CASCADE,
  "organization_id" text REFERENCES "organization"("id") ON DELETE CASCADE,
  "external_user_id" text,
  "service_id" text NOT NULL REFERENCES "services"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'pending',  -- pending, connected, expired, error
  "credentials_enc" text,  -- Encrypted (AES-256-GCM)
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "connected_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),

  UNIQUE ("user_id", "service_id"),
  UNIQUE ("organization_id", "service_id")
);
```

## Indexes

### Primary Keys
All tables use `text` primary keys (UUIDs generated client-side or by crypto.randomUUID()).

### Unique Constraints
- `user.email` - Unique email addresses
- `session.token` - Unique session tokens
- `organization.slug` - Unique organization slugs
- `connections` - Unique per (user_id, service_id) and (organization_id, service_id)

### Foreign Key Cascades
All foreign keys use `ON DELETE CASCADE` to ensure referential integrity.

## JSONB Columns

### organization.metadata

```typescript
interface OrganizationMetadata {
  apiKeys?: Array<{
    id: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
    createdAt: string;
    lastUsedAt?: string;
    expiresAt?: string;
  }>;
  webhookUrl?: string;
  webhookSecret?: string;
  rateLimit?: {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
  };
  customDomain?: string;
}
```

### services.config

```typescript
interface ServiceConfig {
  // OAuth2 services
  authorization_url?: string;
  token_url?: string;
  scopes?: string[];
  pkce?: boolean;

  // API configuration
  base_url?: string;
  documentation_url?: string;

  // UI configuration
  icon?: string;
  color?: string;
  description?: string;
}
```

### connections.metadata

```typescript
interface ConnectionMetadata {
  // During OAuth flow
  state?: string;
  pkce_code_verifier?: string;
  redirect_uri?: string;

  // After connection
  account_id?: string;
  account_name?: string;
  raw_response?: Record<string, unknown>;
}
```

## Encrypted Fields

| Table | Column | Content |
|-------|--------|---------|
| connections | credentials_enc | OAuth tokens, API keys |
| organization_services | oauth_client_secret_enc | OAuth client secrets |
| organization_services | api_key_enc | Service API keys |

All encrypted fields use AES-256-GCM encryption with Base64 encoding.

## Enums

### connection_scope

```sql
CREATE TYPE "connection_scope" AS ENUM ('user', 'organization');
```

- `user` - Connection owned by individual user
- `organization` - Connection shared by organization
