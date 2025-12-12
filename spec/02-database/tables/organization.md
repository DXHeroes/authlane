# organization Table

Organizations (tenants) using Authlane.

## Overview

The `organization` table represents tenants in the multi-tenant architecture. Each organization has its own API keys, service configurations, and connections.

## Schema Definition

```typescript
// packages/database/src/schema/auth.ts
export const organization = pgTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: text('metadata'),
});
```

## Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | No | - | Primary key (UUID) |
| `name` | text | No | - | Organization display name |
| `slug` | text | No | - | URL-safe identifier (unique) |
| `logo` | text | Yes | - | Logo image URL |
| `created_at` | timestamp | No | now() | Creation time |
| `metadata` | text | Yes | - | JSON string with settings |

## Unique Constraints

| Name | Columns | Purpose |
|------|---------|---------|
| `organization_slug_key` | slug | Unique URL-safe identifiers |

## Relationships

| Related Table | Cardinality | Description |
|---------------|-------------|-------------|
| member | 1:N | Organization members |
| invitation | 1:N | Pending invitations |
| organization_services | 1:N | Service configurations |
| connection | 1:N | Organization-scoped connections |

## Metadata Schema

The `metadata` column stores a JSON string with organization settings:

```typescript
interface OrganizationMetadata {
  // API Keys
  apiKeys?: Array<{
    id: string;           // UUID
    name: string;         // Human-readable name
    keyPrefix: string;    // First 10 chars of key (for identification)
    keyHash: string;      // SHA-256 hash of full key
    createdAt: string;    // ISO 8601 timestamp
    lastUsedAt?: string;  // Last usage timestamp
    expiresAt?: string;   // Expiration timestamp
  }>;

  // Webhook Configuration
  webhookUrl?: string;    // URL to receive webhooks
  webhookSecret?: string; // HMAC secret for signing

  // Rate Limiting
  rateLimit?: {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
  };

  // Custom Domain
  customDomain?: string;  // Custom domain for OAuth callbacks

  // Last updated
  updatedAt?: string;     // ISO 8601 timestamp
}
```

## Common Queries

### Find Organization by Slug

```typescript
const org = await db.query.organization.findFirst({
  where: eq(organization.slug, slug),
});
```

### Find Organization by ID with Members

```typescript
const orgWithMembers = await db.query.organization.findFirst({
  where: eq(organization.id, orgId),
  with: {
    members: {
      with: { user: true },
    },
  },
});
```

### Create Organization

```typescript
const [newOrg] = await db.insert(organization).values({
  id: crypto.randomUUID(),
  name: 'My Company',
  slug: 'my-company',
  metadata: JSON.stringify({
    apiKeys: [],
    createdAt: new Date().toISOString(),
  }),
}).returning();
```

### Update Organization Settings

```typescript
const org = await db.query.organization.findFirst({
  where: eq(organization.id, orgId),
});

const metadata = JSON.parse(org.metadata || '{}');
metadata.webhookUrl = 'https://example.com/webhook';
metadata.updatedAt = new Date().toISOString();

await db.update(organization)
  .set({ metadata: JSON.stringify(metadata) })
  .where(eq(organization.id, orgId));
```

### Find Organization by API Key

```typescript
const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

const orgs = await db.query.organization.findMany();
for (const org of orgs) {
  const metadata = JSON.parse(org.metadata || '{}');
  const matchingKey = metadata.apiKeys?.find(k => k.keyHash === keyHash);
  if (matchingKey) {
    return org;
  }
}
```

## API Key Management

### Create API Key

```typescript
async function createApiKey(orgId: string, name: string, expiresAt?: Date) {
  const apiKey = `ak_${crypto.randomBytes(16).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const keyPrefix = apiKey.substring(0, 10);

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, orgId),
  });

  const metadata = JSON.parse(org.metadata || '{}');
  metadata.apiKeys = metadata.apiKeys || [];
  metadata.apiKeys.push({
    id: crypto.randomUUID(),
    name,
    keyPrefix,
    keyHash,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt?.toISOString(),
  });

  await db.update(organization)
    .set({ metadata: JSON.stringify(metadata) })
    .where(eq(organization.id, orgId));

  return apiKey; // Return only once - not stored in plaintext
}
```

### Revoke API Key

```typescript
async function revokeApiKey(orgId: string, keyId: string) {
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, orgId),
  });

  const metadata = JSON.parse(org.metadata || '{}');
  metadata.apiKeys = metadata.apiKeys?.filter(k => k.id !== keyId) || [];

  await db.update(organization)
    .set({ metadata: JSON.stringify(metadata) })
    .where(eq(organization.id, orgId));
}
```

## TypeScript Types

```typescript
import { Organization, NewOrganization } from '@authlane/database';

// Select type
const existingOrg: Organization = {
  id: 'org_123',
  name: 'Acme Inc',
  slug: 'acme-inc',
  logo: 'https://example.com/logo.png',
  createdAt: new Date(),
  metadata: '{"apiKeys":[],"webhookUrl":"https://..."}',
};

// Insert type
const newOrg: NewOrganization = {
  id: 'org_456',
  name: 'New Company',
  slug: 'new-company',
};
```

## Slug Generation

Slugs are generated from the organization name:

```typescript
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

// "My Company Inc." → "my-company-inc"
```

## Deleting Organizations

Deleting an organization cascades to:
- All members
- All invitations
- All organization_services
- All organization-scoped connections

```typescript
await db.delete(organization)
  .where(eq(organization.id, orgId));
```

⚠️ **Warning:** This is destructive. Require confirmation in the UI.

## Member Roles

Organization members have roles defined in the `member` table:

| Role | Permissions |
|------|-------------|
| `owner` | Full access, can delete organization |
| `admin` | Manage services, API keys, members |
| `member` | View-only access |

## Security Notes

1. **API keys stored as hashes** - Only prefix and hash stored, never plaintext
2. **Webhook secret** - Used for HMAC signatures, should be strong random string
3. **Cascading deletes** - All related data deleted with organization
4. **Slug uniqueness** - Prevents org impersonation via URL
