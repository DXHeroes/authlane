# Database

This section documents the Authlane database schema, tables, relationships, and data access patterns.

## Contents

- [Schema Overview](./schema-overview.md) - Complete schema documentation
- [Entity Relationship](./entity-relationship.md) - ER diagrams and relationships
- [Row-Level Security](./row-level-security.md) - RLS policies for multi-tenancy
- [Migrations](./migrations.md) - Migration guide and procedures

### Table Documentation

- [user](./tables/user.md) - Authenticated users
- [session](./tables/session.md) - User sessions
- [account](./tables/account.md) - OAuth accounts
- [organization](./tables/organization.md) - Organizations/tenants
- [member](./tables/member.md) - Organization membership
- [invitation](./tables/invitation.md) - Organization invitations
- [services](./tables/services.md) - Available services
- [organization_services](./tables/organization-services.md) - Per-org service config
- [connections](./tables/connections.md) - User/org connections

## Database Technology

| Component | Technology | Version |
|-----------|------------|---------|
| Database | PostgreSQL | 16+ |
| ORM | Drizzle | 0.44+ |
| Migrations | Drizzle Kit | Latest |

## Connection

```typescript
// packages/database/src/client.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
const client = postgres(connectionString);
export const db = drizzle(client, { schema });
```

## Schema Location

All schema definitions are in:
```
packages/database/src/schema/
├── index.ts                    # Schema exports
├── auth.ts                     # User, session, account, org, member, invitation
├── connections.ts              # Connections table
├── services.ts                 # Services table
└── organization-services.ts    # Org-service junction table
```

## Key Concepts

### Multi-Tenancy
- Organization-based isolation
- Row-Level Security (RLS) ready
- All queries filter by organization

### Encryption
- Credentials encrypted at rest (AES-256-GCM)
- OAuth client secrets encrypted
- API keys encrypted

### Relationships
- Users belong to Organizations via Members
- Connections link Users/Organizations to Services
- Organization Services customize service configuration

## TypeScript Types

All tables export TypeScript types:

```typescript
import {
  User, NewUser,
  Session, NewSession,
  Account, NewAccount,
  Organization, NewOrganization,
  Member, NewMember,
  Invitation, NewInvitation,
  Service, NewService,
  OrganizationService, NewOrganizationService,
  Connection, NewConnection,
} from '@authlane/database';
```

## Quick Reference

| Table | Primary Key | Foreign Keys |
|-------|-------------|--------------|
| user | id | - |
| session | id | user_id |
| account | id | user_id |
| organization | id | - |
| member | id | organization_id, user_id |
| invitation | id | organization_id, inviter_id |
| services | id | - |
| organization_services | (organization_id, service_id) | organization_id, service_id |
| connections | id | user_id, organization_id, service_id |
