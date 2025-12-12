# account Table

OAuth provider accounts linked to users.

## Overview

The `account` table stores OAuth provider connections for user authentication (e.g., "Login with Google"). This is separate from `connections` which stores end-user service connections.

## Schema Definition

```typescript
// packages/database/src/schema/auth.ts
export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

## Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | No | - | Primary key |
| `account_id` | text | No | - | ID at the OAuth provider |
| `provider_id` | text | No | - | Provider identifier (google, github) |
| `user_id` | text | No | - | User FK |
| `access_token` | text | Yes | - | OAuth access token |
| `refresh_token` | text | Yes | - | OAuth refresh token |
| `id_token` | text | Yes | - | OpenID Connect ID token |
| `access_token_expires_at` | timestamp | Yes | - | Access token expiry |
| `refresh_token_expires_at` | timestamp | Yes | - | Refresh token expiry |
| `scope` | text | Yes | - | Granted OAuth scopes |
| `password` | text | Yes | - | Hashed password (email auth) |
| `created_at` | timestamp | No | now() | Account creation |
| `updated_at` | timestamp | No | now() | Last update |

## Foreign Keys

| Column | References | On Delete |
|--------|------------|-----------|
| `user_id` | user.id | CASCADE |

## Account Types

### OAuth Provider Account

For social login (Google, GitHub, etc.):

```typescript
{
  id: 'acc_123',
  accountId: '12345678',           // Google user ID
  providerId: 'google',
  userId: 'usr_456',
  accessToken: 'ya29...',
  refreshToken: '1//...',
  idToken: 'eyJ...',
  accessTokenExpiresAt: new Date(),
  scope: 'email profile',
}
```

### Email/Password Account

For email-based authentication:

```typescript
{
  id: 'acc_789',
  accountId: 'john@example.com',   // Email as account ID
  providerId: 'credential',
  userId: 'usr_456',
  password: '$2b$10$...',          // bcrypt hash
  accessToken: null,
  refreshToken: null,
}
```

## Common Queries

### Find Account by Provider

```typescript
const account = await db.query.account.findFirst({
  where: and(
    eq(account.providerId, 'google'),
    eq(account.accountId, googleUserId),
  ),
  with: { user: true },
});
```

### Get User's Linked Accounts

```typescript
const accounts = await db.query.account.findMany({
  where: eq(account.userId, userId),
});

// Returns: [{ providerId: 'google', ... }, { providerId: 'credential', ... }]
```

### Link OAuth Account

```typescript
await db.insert(account).values({
  id: crypto.randomUUID(),
  accountId: oauthUserInfo.id,
  providerId: 'github',
  userId: existingUserId,
  accessToken: tokens.access_token,
  refreshToken: tokens.refresh_token,
  scope: tokens.scope,
  accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
});
```

### Create Email Account

```typescript
const hashedPassword = await bcrypt.hash(password, 10);

await db.insert(account).values({
  id: crypto.randomUUID(),
  accountId: email,
  providerId: 'credential',
  userId: userId,
  password: hashedPassword,
});
```

### Verify Password

```typescript
const account = await db.query.account.findFirst({
  where: and(
    eq(account.accountId, email),
    eq(account.providerId, 'credential'),
  ),
  with: { user: true },
});

if (account?.password) {
  const valid = await bcrypt.compare(password, account.password);
}
```

### Update OAuth Tokens

```typescript
await db.update(account)
  .set({
    accessToken: newTokens.access_token,
    refreshToken: newTokens.refresh_token,
    accessTokenExpiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
    updatedAt: new Date(),
  })
  .where(eq(account.id, accountId));
```

### Unlink Account

```typescript
// Ensure user has another way to login
const accounts = await db.query.account.findMany({
  where: eq(account.userId, userId),
});

if (accounts.length > 1) {
  await db.delete(account)
    .where(eq(account.id, accountId));
}
```

## TypeScript Types

```typescript
import { Account, NewAccount } from '@authlane/database';

// Select type
const existingAccount: Account = {
  id: 'acc_123',
  accountId: '12345',
  providerId: 'google',
  userId: 'usr_456',
  accessToken: 'ya29...',
  refreshToken: '1//...',
  idToken: 'eyJ...',
  accessTokenExpiresAt: new Date(),
  refreshTokenExpiresAt: null,
  scope: 'email profile',
  password: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
```

## Provider IDs

| Provider ID | Description |
|-------------|-------------|
| `credential` | Email/password auth |
| `google` | Google OAuth |
| `github` | GitHub OAuth |
| `apple` | Apple Sign In |

## Security Notes

1. **Passwords are hashed** - Using bcrypt with cost factor 10+
2. **Tokens are sensitive** - Consider encrypting access/refresh tokens
3. **Cascading delete** - Accounts deleted when user is deleted
4. **Multiple accounts OK** - Users can have multiple providers linked
5. **Can't unlink last account** - User needs at least one way to login
