# Row-Level Security

PostgreSQL Row-Level Security (RLS) configuration for multi-tenant data isolation in Authlane.

## Overview

Row-Level Security provides database-level enforcement of multi-tenancy, ensuring queries only return data for the authorized organization regardless of application logic.

## Current Status

The schema is **RLS-ready** but policies are currently enforced at the application level. Full RLS policies are planned for v1.1.

## Planned RLS Implementation

### Enable RLS on Tables

```sql
-- Enable RLS on multi-tenant tables
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE member ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation ENABLE ROW LEVEL SECURITY;
```

### Set Organization Context

Each request sets the current organization context:

```sql
-- Set at the beginning of each request
SET LOCAL app.current_org = 'org_abc123';

-- Or in application code
await db.execute(sql`SET LOCAL app.current_org = ${organizationId}`);
```

### Connection Policies

```sql
-- Connections policy: users see connections for their organization
CREATE POLICY connections_org_isolation ON connections
    FOR ALL
    USING (organization_id = current_setting('app.current_org', true)::text);

-- Alternative: user-based policy
CREATE POLICY connections_user_isolation ON connections
    FOR ALL
    USING (
        user_id = current_setting('app.current_user', true)::text
        OR organization_id = current_setting('app.current_org', true)::text
    );
```

### Organization Services Policies

```sql
-- Org services: only see own organization's configurations
CREATE POLICY org_services_isolation ON organization_services
    FOR ALL
    USING (organization_id = current_setting('app.current_org', true)::text);
```

### Member Policies

```sql
-- Members: only see members of your organizations
CREATE POLICY members_org_isolation ON member
    FOR ALL
    USING (organization_id = current_setting('app.current_org', true)::text);
```

### Invitation Policies

```sql
-- Invitations: only see invitations for your organization
CREATE POLICY invitations_org_isolation ON invitation
    FOR ALL
    USING (organization_id = current_setting('app.current_org', true)::text);
```

## Application-Level Enforcement

Until RLS is fully implemented, isolation is enforced at the application level:

### Middleware Pattern

```typescript
// apps/api/src/middleware/auth.ts
export async function authMiddleware(c: Context, next: Next) {
  // Extract organization from session or API key
  const organization = await getOrganizationFromRequest(c);

  if (!organization) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Set context for all downstream handlers
  c.set('organization', organization);

  await next();
}
```

### Query Pattern

```typescript
// Always filter by organization
export async function getConnections(orgId: string) {
  return db.query.connections.findMany({
    where: eq(connections.organizationId, orgId), // REQUIRED
  });
}

// WRONG: Never query without organization filter
// return db.query.connections.findMany(); // NO!
```

### Service Layer Pattern

```typescript
// apps/api/src/services/connections.ts
export class ConnectionService {
  constructor(private organizationId: string) {}

  async list() {
    // Organization filter always applied
    return db.query.connections.findMany({
      where: eq(connections.organizationId, this.organizationId),
    });
  }

  async getById(connectionId: string) {
    // Double-check: get by ID AND organization
    return db.query.connections.findFirst({
      where: and(
        eq(connections.id, connectionId),
        eq(connections.organizationId, this.organizationId),
      ),
    });
  }
}
```

## Defense in Depth

RLS provides an additional security layer, not the only one:

```
┌─────────────────────────────────────────────┐
│ Layer 1: API Authentication                  │
│ (Validate session/API key)                   │
├─────────────────────────────────────────────┤
│ Layer 2: Authorization Check                 │
│ (Verify organization access)                 │
├─────────────────────────────────────────────┤
│ Layer 3: Application Filter                  │
│ (WHERE organization_id = ?)                  │
├─────────────────────────────────────────────┤
│ Layer 4: Row-Level Security (Database)       │
│ (Enforced by PostgreSQL)                     │
└─────────────────────────────────────────────┘
```

## Testing Isolation

E2E tests verify data isolation:

```typescript
// e2e/organization.spec.ts
test('cannot access other organization connections', async ({ page }) => {
  // Create org1 and org2
  const org1 = await createOrganization('Org 1');
  const org2 = await createOrganization('Org 2');

  // Create connection in org1
  const connection = await createConnection({
    organizationId: org1.id,
    serviceId: 'github',
  });

  // Try to access from org2
  const response = await fetch(`/api/v1/connections/${connection.id}`, {
    headers: { Authorization: `Bearer ${org2.apiKey}` },
  });

  // Should get 404, not 403 (don't reveal existence)
  expect(response.status).toBe(404);
});
```

## Bypass Patterns

Some operations require bypassing RLS (e.g., admin tools, migrations):

```sql
-- Create a superuser role that bypasses RLS
CREATE ROLE authlane_admin BYPASSRLS;

-- Use for admin operations only
SET ROLE authlane_admin;
-- ... admin queries ...
RESET ROLE;
```

**Warning:** Never expose RLS-bypassing operations through the API.

## Performance Considerations

RLS adds minimal overhead when properly indexed:

```sql
-- Ensure indexes exist for RLS filter columns
CREATE INDEX idx_connections_org ON connections(organization_id);
CREATE INDEX idx_org_services_org ON organization_services(organization_id);
CREATE INDEX idx_members_org ON member(organization_id);
CREATE INDEX idx_invitations_org ON invitation(organization_id);
```

## Migration to RLS

Planned migration steps:

1. **Phase 1**: Add RLS policies in permissive mode (audit only)
2. **Phase 2**: Test with application + RLS enforcement
3. **Phase 3**: Enable restrictive RLS
4. **Phase 4**: Remove redundant application-level filters (optional)

```sql
-- Phase 1: Audit mode (log but don't block)
ALTER TABLE connections FORCE ROW LEVEL SECURITY;
CREATE POLICY connections_audit ON connections
    FOR ALL
    USING (true)  -- Allow all, but log
    WITH CHECK (organization_id = current_setting('app.current_org')::text);

-- Phase 3: Restrictive mode
DROP POLICY connections_audit ON connections;
CREATE POLICY connections_isolation ON connections
    FOR ALL
    USING (organization_id = current_setting('app.current_org')::text);
```

## Common Pitfalls

### 1. Forgetting to Set Context

```typescript
// WRONG: No organization context set
const connections = await db.query.connections.findMany();

// RIGHT: Context set before query
await db.execute(sql`SET LOCAL app.current_org = ${orgId}`);
const connections = await db.query.connections.findMany();
```

### 2. Using BYPASSRLS Incorrectly

```typescript
// WRONG: Using bypass for regular queries
await db.execute(sql`SET ROLE authlane_admin`);
const userConnections = await getConnections(); // Bypasses isolation!

// RIGHT: Only use bypass for admin operations
if (isAdminOperation) {
  await db.execute(sql`SET ROLE authlane_admin`);
  // ... admin-only operation ...
  await db.execute(sql`RESET ROLE`);
}
```

### 3. Leaking Cross-Tenant Data in Errors

```typescript
// WRONG: Reveals that connection exists
if (connection.organizationId !== currentOrg.id) {
  throw new Error('Access denied to connection xyz');
}

// RIGHT: Generic error, don't reveal existence
const connection = await db.query.connections.findFirst({
  where: and(
    eq(connections.id, connectionId),
    eq(connections.organizationId, currentOrg.id),
  ),
});
if (!connection) {
  throw new Error('Connection not found'); // Same as non-existent
}
```
