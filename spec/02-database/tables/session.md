# session Table

User sessions for cookie-based authentication.

## Overview

The `session` table stores active user sessions. Sessions are created at login and used for dashboard authentication.

## Schema Definition

```typescript
// packages/database/src/schema/auth.ts
export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  activeOrganizationId: text('active_organization_id'),
});
```

## Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | No | - | Primary key |
| `expires_at` | timestamp | No | - | Session expiration |
| `token` | text | No | - | Unique session token |
| `created_at` | timestamp | No | now() | Creation time |
| `updated_at` | timestamp | No | now() | Last update |
| `ip_address` | text | Yes | - | Client IP address |
| `user_agent` | text | Yes | - | Client user agent |
| `user_id` | text | No | - | User FK |
| `active_organization_id` | text | Yes | - | Currently selected org |

## Unique Constraints

| Name | Columns | Purpose |
|------|---------|---------|
| `session_token_key` | token | Unique session tokens |

## Foreign Keys

| Column | References | On Delete |
|--------|------------|-----------|
| `user_id` | user.id | CASCADE |

## Session Configuration

Better Auth manages sessions with these defaults:

```typescript
{
  session: {
    expiresIn: 60 * 60 * 24 * 7,  // 7 days
    updateAge: 60 * 60 * 24,      // Update session daily
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,             // 5 minute cache
    },
  },
}
```

## Common Queries

### Get Session by Token

```typescript
const session = await db.query.session.findFirst({
  where: eq(session.token, token),
  with: { user: true },
});
```

### Get User's Active Sessions

```typescript
const sessions = await db.query.session.findMany({
  where: and(
    eq(session.userId, userId),
    gt(session.expiresAt, new Date()),
  ),
});
```

### Delete Session (Logout)

```typescript
await db.delete(session)
  .where(eq(session.id, sessionId));
```

### Delete All User Sessions

```typescript
await db.delete(session)
  .where(eq(session.userId, userId));
```

### Set Active Organization

```typescript
await db.update(session)
  .set({
    activeOrganizationId: orgId,
    updatedAt: new Date(),
  })
  .where(eq(session.id, sessionId));
```

### Clean Expired Sessions

```typescript
await db.delete(session)
  .where(lt(session.expiresAt, new Date()));
```

## TypeScript Types

```typescript
import { Session, NewSession } from '@authlane/database';

// Select type
const existingSession: Session = {
  id: 'sess_123',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  token: 'abc123...',
  createdAt: new Date(),
  updatedAt: new Date(),
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0...',
  userId: 'usr_456',
  activeOrganizationId: 'org_789',
};
```

## Security Notes

1. **Token is unique** - Prevents session hijacking via token collision
2. **IP/UserAgent tracking** - For suspicious activity detection
3. **Cascading delete** - Sessions deleted when user is deleted
4. **Expiration** - Sessions automatically expire
