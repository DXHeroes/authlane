# member Table

Organization membership linking users to organizations.

## Overview

The `member` table is a junction table that defines which users belong to which organizations and their roles within each organization.

## Schema Definition

```typescript
// packages/database/src/schema/auth.ts
export const member = pgTable('member', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

## Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | No | - | Primary key |
| `organization_id` | text | No | - | Organization FK |
| `user_id` | text | No | - | User FK |
| `role` | text | No | 'member' | User's role in organization |
| `created_at` | timestamp | No | now() | When user joined |

## Foreign Keys

| Column | References | On Delete |
|--------|------------|-----------|
| `organization_id` | organization.id | CASCADE |
| `user_id` | user.id | CASCADE |

## Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| `owner` | Organization owner | Full access, can delete org |
| `admin` | Administrator | Manage services, members, API keys |
| `member` | Regular member | View-only access |

## Role Permissions Matrix

| Action | owner | admin | member |
|--------|-------|-------|--------|
| View dashboard | ✅ | ✅ | ✅ |
| View connections | ✅ | ✅ | ✅ |
| View services | ✅ | ✅ | ✅ |
| Configure services | ✅ | ✅ | ❌ |
| Create API keys | ✅ | ✅ | ❌ |
| Revoke API keys | ✅ | ✅ | ❌ |
| Invite members | ✅ | ✅ | ❌ |
| Remove members | ✅ | ✅ | ❌ |
| Change member roles | ✅ | ✅ | ❌ |
| Update org settings | ✅ | ✅ | ❌ |
| Transfer ownership | ✅ | ❌ | ❌ |
| Delete organization | ✅ | ❌ | ❌ |

## Common Queries

### Get User's Organizations

```typescript
const memberships = await db.query.member.findMany({
  where: eq(member.userId, userId),
  with: {
    organization: true,
  },
});
```

### Get Organization Members

```typescript
const members = await db.query.member.findMany({
  where: eq(member.organizationId, orgId),
  with: {
    user: true,
  },
});
```

### Check User's Role

```typescript
const membership = await db.query.member.findFirst({
  where: and(
    eq(member.userId, userId),
    eq(member.organizationId, orgId),
  ),
});

if (membership?.role === 'owner' || membership?.role === 'admin') {
  // Can perform admin actions
}
```

### Add Member

```typescript
await db.insert(member).values({
  id: crypto.randomUUID(),
  organizationId: orgId,
  userId: userId,
  role: 'member',
});
```

### Update Role

```typescript
await db.update(member)
  .set({ role: 'admin' })
  .where(and(
    eq(member.userId, userId),
    eq(member.organizationId, orgId),
  ));
```

### Remove Member

```typescript
await db.delete(member)
  .where(and(
    eq(member.userId, userId),
    eq(member.organizationId, orgId),
  ));
```

### Get Organization Owner

```typescript
const owner = await db.query.member.findFirst({
  where: and(
    eq(member.organizationId, orgId),
    eq(member.role, 'owner'),
  ),
  with: { user: true },
});
```

### Transfer Ownership

```typescript
await db.transaction(async (tx) => {
  // Demote current owner to admin
  await tx.update(member)
    .set({ role: 'admin' })
    .where(and(
      eq(member.organizationId, orgId),
      eq(member.role, 'owner'),
    ));

  // Promote new owner
  await tx.update(member)
    .set({ role: 'owner' })
    .where(and(
      eq(member.organizationId, orgId),
      eq(member.userId, newOwnerId),
    ));
});
```

## TypeScript Types

```typescript
import { Member, NewMember } from '@authlane/database';

// Select type
const existingMember: Member = {
  id: 'mbr_123',
  organizationId: 'org_456',
  userId: 'usr_789',
  role: 'admin',
  createdAt: new Date(),
};

// Insert type
const newMember: NewMember = {
  id: 'mbr_new',
  organizationId: 'org_456',
  userId: 'usr_new',
  role: 'member',
};
```

## Business Rules

1. **Every org needs an owner** - At least one member must have `owner` role
2. **Can't remove last owner** - Ownership must be transferred first
3. **Can't demote self** - Owners can't demote themselves
4. **Single ownership** - Only one owner per organization
5. **Cascading delete** - Membership deleted when user or org is deleted

## Security Notes

1. **Role validation** - Always validate role before sensitive operations
2. **No self-modification** - Users shouldn't modify their own membership
3. **Audit changes** - Log all role changes for security review
