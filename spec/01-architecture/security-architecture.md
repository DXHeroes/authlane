# Security Architecture

Defense-in-depth security model for Authlane, covering encryption, authentication, authorization, and threat mitigation.

## Security Principles

1. **Defense in Depth** - Multiple layers of security controls
2. **Least Privilege** - Minimal access by default
3. **Encryption by Default** - All sensitive data encrypted
4. **Fail Secure** - Errors don't expose data
5. **Audit Everything** - Log all security-relevant events

## Security Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    External Traffic                          │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   TLS 1.3         │  Layer 1: Transport
                    │   (Encryption)    │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Rate Limiting   │  Layer 2: Availability
                    │   (DDoS protect)  │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Authentication  │  Layer 3: Identity
                    │   (Session/API)   │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Authorization   │  Layer 4: Access
                    │   (Org isolation) │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Input Valid.    │  Layer 5: Data
                    │   (Zod schemas)   │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Encryption      │  Layer 6: Storage
                    │   (AES-256-GCM)   │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Database RLS    │  Layer 7: Isolation
                    │   (Tenant sep.)   │
                    └─────────────────────┘
```

## Encryption

### Encryption at Rest

All sensitive data is encrypted using AES-256-GCM:

| Data Type | Encrypted | Algorithm |
|-----------|-----------|-----------|
| OAuth access tokens | Yes | AES-256-GCM |
| OAuth refresh tokens | Yes | AES-256-GCM |
| API keys (org custom) | Yes | AES-256-GCM |
| User passwords | Hashed | bcrypt |
| API key identifiers | Hashed | SHA-256 |

**Encryption Process:**
```
┌─────────────────────────────────────────────────────────────┐
│                    Encryption Flow                           │
├─────────────────────────────────────────────────────────────┤
│  plaintext → generate_iv() → AES-256-GCM encrypt            │
│           → append auth_tag → base64 encode → ciphertext    │
└─────────────────────────────────────────────────────────────┘

IV (12 bytes) + Ciphertext + Auth Tag (16 bytes) = Encrypted String
```

**Implementation:**
```typescript
// packages/crypto/src/index.ts
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Combine: IV + Ciphertext + AuthTag
  return Buffer.concat([
    iv,
    Buffer.from(encrypted, 'base64'),
    authTag,
  ]).toString('base64');
}
```

### Encryption in Transit

- **TLS 1.3** for all external connections
- **Certificate pinning** recommended for SDK
- **HSTS** headers enforced

### Key Management

| Environment | Key Storage |
|-------------|-------------|
| Development | Environment variable (`ENCRYPTION_KEY`) |
| Production | HashiCorp Vault or AWS KMS (recommended) |
| Self-hosted | Environment variable or mounted secret |

**Key Rotation:**
1. Generate new encryption key
2. Re-encrypt all credentials with new key
3. Update key reference
4. Delete old key

## Authentication

### Session-Based Authentication

Using Better Auth for session management:

```typescript
// Session configuration
{
  session: {
    expiresIn: 60 * 60 * 24 * 7,  // 7 days
    updateAge: 60 * 60 * 24,      // Update daily
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,             // 5 minute cache
    },
  },
}
```

**Session Security:**
- HTTP-only cookies (no JavaScript access)
- Secure flag (HTTPS only)
- SameSite=Lax (CSRF protection)
- IP and User-Agent tracking

### API Key Authentication

For programmatic access:

```typescript
// API Key format
const apiKey = `ak_${crypto.randomBytes(16).toString('hex')}`;
// Example: ak_a1b2c3d4e5f6789012345678901234ab

// Storage (only hash stored)
const keyHash = crypto
  .createHash('sha256')
  .update(apiKey)
  .digest('hex');
```

**API Key Security:**
- Keys shown once at creation
- Only hash stored in database
- Prefix (`ak_`) for identification
- Optional expiration dates

### Authentication Flow

```
Request
   │
   ▼
┌──────────────────────────────────────┐
│ Check Authorization header            │
│ ├─ Bearer ak_... → API Key auth      │
│ ├─ ApiKey ak_... → API Key auth      │
│ └─ None → Check session cookie       │
└──────────────────────────────────────┘
   │
   ├─── API Key Path ───────────────────┐
   │    Hash key → Find org → Set ctx   │
   │                                     │
   └─── Session Path ───────────────────┐
        Validate cookie → Get user+org   │
        → Set context                    │
```

## Authorization

### Role-Based Access Control (RBAC)

| Role | Dashboard | Services | Connections | API Keys | Members | Settings | Delete Org |
|------|-----------|----------|-------------|----------|---------|----------|------------|
| owner | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| member | ✅ | 👁️ | 👁️ | ❌ | 👁️ | ❌ | ❌ |

Legend: ✅ Full access, 👁️ View only, ❌ No access

### API Endpoint Authorization

```typescript
// Authorization check in route handler
app.delete('/api/v1/organization', async (c) => {
  const { user, organization } = getAuthContext(c);

  // Check role
  const member = await getMember(user.id, organization.id);
  if (member.role !== 'owner') {
    return c.json({
      data: null,
      error: {
        message: 'Only owners can delete organizations',
        code: 'FORBIDDEN',
        statusCode: 403,
      },
    }, 403);
  }

  // Proceed with deletion...
});
```

## OAuth Security

### PKCE (Proof Key for Code Exchange)

**Mandatory for all OAuth flows** to prevent authorization code interception:

```typescript
// Generate PKCE values
const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto
  .createHash('sha256')
  .update(codeVerifier)
  .digest('base64url');

// Authorization request includes challenge
const authUrl = new URL(provider.authorizationUrl);
authUrl.searchParams.set('code_challenge', codeChallenge);
authUrl.searchParams.set('code_challenge_method', 'S256');

// Token exchange includes verifier
const tokenResponse = await fetch(provider.tokenUrl, {
  body: new URLSearchParams({
    code: authorizationCode,
    code_verifier: codeVerifier,
    // ...
  }),
});
```

### State Parameter

**Prevents CSRF attacks** in OAuth flows:

```typescript
// Generate cryptographically random state
const state = crypto.randomBytes(32).toString('base64url');

// Store state in pending connection
await db.insert(connections).values({
  status: 'pending',
  metadata: { state, pkceCodeVerifier },
});

// Validate on callback
const connection = await db.query.connections.findFirst({
  where: eq(connections.metadata.state, state),
});

if (!connection) {
  throw new Error('Invalid state parameter');
}
```

### Token Storage

```
┌─────────────────────────────────────────────────────────────┐
│                    Token Lifecycle                           │
├─────────────────────────────────────────────────────────────┤
│  1. Receive tokens from OAuth provider                       │
│  2. Encrypt with AES-256-GCM                                │
│  3. Store encrypted string in database                       │
│  4. On retrieval: decrypt → validate → use                  │
│  5. Before expiry: refresh → re-encrypt → store             │
└─────────────────────────────────────────────────────────────┘
```

## Rate Limiting

Protection against abuse and DDoS:

```typescript
// Rate limit configuration
const rateLimitConfig = {
  windowMs: 60 * 1000,    // 1 minute window
  maxRequests: 100,        // 100 requests per window
};

// Priority: Organization > User > API Key > IP
function getRateLimitKey(c: Context): string {
  const org = c.get('organization');
  const user = c.get('user');
  const apiKey = c.get('apiKey');

  if (org) return `org:${org.id}`;
  if (user) return `user:${user.id}`;
  if (apiKey) return `apikey:${apiKey.substring(0, 10)}`;
  return `ip:${c.req.header('x-forwarded-for') || 'unknown'}`;
}
```

**Rate Limit Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1702459200
```

## Input Validation

All inputs validated with Zod schemas:

```typescript
// Example: Connection creation schema
const createConnectionSchema = z.object({
  serviceId: z.string().min(1).max(50),
  userId: z.string().min(1).max(255),
  scope: z.enum(['user', 'organization']).default('user'),
  redirectUri: z.string().url().optional(),
});

// Validation in route handler
app.post('/connections', async (c) => {
  const body = await c.req.json();
  const result = createConnectionSchema.safeParse(body);

  if (!result.success) {
    return c.json({
      data: null,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        hint: result.error.message,
        statusCode: 400,
      },
    }, 400);
  }

  // Use validated data
  const data = result.data;
});
```

## Error Handling

Errors never expose sensitive information:

```typescript
// GOOD: Generic error message
{
  "error": {
    "message": "Authentication failed",
    "code": "UNAUTHORIZED"
  }
}

// BAD: Leaks information
{
  "error": {
    "message": "User john@example.com not found"
  }
}
```

## Audit Logging

All security-relevant events are logged:

| Event | Logged Data |
|-------|-------------|
| Login success | userId, organizationId, IP, userAgent |
| Login failure | email (hashed), IP, reason |
| API key created | organizationId, keyPrefix, createdBy |
| API key used | keyPrefix, endpoint, IP |
| Credential access | connectionId, userId, IP |
| OAuth flow | serviceId, userId, success/failure |

```typescript
// Example audit log
logger.info({
  event: 'credential_access',
  organizationId: org.id,
  connectionId: connection.id,
  userId: user?.id,
  serviceId: connection.serviceId,
  ip: request.ip,
  timestamp: new Date().toISOString(),
});
```

## Security Headers

```typescript
// Security headers applied to all responses
app.use('*', async (c, next) => {
  await next();

  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Content-Security-Policy', "default-src 'self'");
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
});
```

## Secrets Management

| Secret | Storage Location | Rotation |
|--------|------------------|----------|
| `ENCRYPTION_KEY` | Environment / Vault | Manual, with re-encryption |
| `DATABASE_URL` | Environment | On password change |
| `REDIS_URL` | Environment | On password change |
| OAuth client secrets | Encrypted in DB | Per provider requirements |
| API keys | Hashed in DB | User-initiated |

## Vulnerability Mitigation

### SQL Injection
- **Mitigation**: Drizzle ORM with parameterized queries
- **Defense**: Input validation with Zod

### XSS (Cross-Site Scripting)
- **Mitigation**: React's automatic escaping
- **Defense**: CSP headers, no `dangerouslySetInnerHTML`

### CSRF (Cross-Site Request Forgery)
- **Mitigation**: SameSite cookies, state parameter
- **Defense**: Origin validation

### Credential Stuffing
- **Mitigation**: Rate limiting, account lockout
- **Defense**: bcrypt for password hashing

### Authorization Code Interception
- **Mitigation**: Mandatory PKCE
- **Defense**: State parameter validation
