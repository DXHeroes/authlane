# Common Issues and Solutions

> For encryption or authentication issues, use `docs/security/OPERATIONS.md`. Historical
> `ENCRYPTION_KEY` instructions below are superseded by three independent versioned keyrings.

Troubleshooting guide for common Authlane issues.

## Connection Issues

### "Connection not found"

**Error Code**: `CONNECTION_NOT_FOUND`

**Cause**: The user hasn't connected the requested service.

**Solution**:
```typescript
const { data, error } = await authlane.connections.getCredentials({
  userId,
  serviceId: 'github',
});

if (error?.code === 'CONNECTION_NOT_FOUND') {
  // Redirect user to connect
  const { data: auth } = await authlane.oauth.authorize({
    userId,
    serviceId: 'github',
  });
  return { needsConnection: true, authUrl: auth.authorizationUrl };
}
```

### "Connection expired"

**Error Code**: `CONNECTION_EXPIRED`

**Cause**: OAuth token expired and couldn't be refreshed.

**Reasons**:
- Refresh token is invalid or revoked
- User revoked access in the service
- Service has stricter token policies

**Solution**:
```typescript
if (error?.code === 'CONNECTION_EXPIRED') {
  // Need fresh authorization
  const { data: auth } = await authlane.oauth.authorize({
    userId,
    serviceId: 'github',
    force: true, // Force re-authorization
  });
  return { needsReconnection: true, authUrl: auth.authorizationUrl };
}
```

### "Invalid redirect URI"

**Cause**: OAuth callback URL doesn't match what's configured.

**Solution**:
1. Check your OAuth app settings in the service
2. Add the callback URL: `https://your-domain.com/api/v1/oauth/callback/{service-id}`
3. Ensure HTTPS is used in production

## Authentication Issues

### "Invalid API key"

**Error Code**: `INVALID_API_KEY`

**Causes**:
- API key is incorrect
- Key has been revoked
- Wrong header format

**Solution**:
```typescript
// Correct header format
headers: {
  'X-API-Key': 'ak_live_xxxxxxxxxxxx'
}
// Or
headers: {
  'Authorization': 'Bearer ak_live_xxxxxxxxxxxx'
}
```

### "Insufficient scope"

**Error Code**: `INSUFFICIENT_SCOPE`

**Cause**: API key doesn't have required permissions.

**Solution**:
1. Check the endpoint's required scope
2. Create a new API key with the necessary scopes
3. Update your application to use the new key

### "API key expired"

**Error Code**: `API_KEY_EXPIRED`

**Cause**: API key had an expiration date that has passed.

**Solution**:
1. Create a new API key in the dashboard
2. Update your application configuration
3. Remove the old key

## OAuth Issues

### "Invalid state parameter"

**Error Code**: `INVALID_STATE`

**Causes**:
- OAuth state expired (default: 10 minutes)
- User opened link in different browser
- CSRF validation failed

**Solution**:
- Start a fresh OAuth flow
- Ensure cookies are enabled
- Don't share OAuth URLs between browsers

### "Token exchange failed"

**Error Code**: `TOKEN_EXCHANGE_FAILED`

**Causes**:
- OAuth code already used
- Code expired
- Service API issues

**Solution**:
```typescript
// Start fresh OAuth flow
const { data } = await authlane.oauth.authorize({
  userId,
  serviceId,
});
```

### "Scope not granted"

**Cause**: User didn't grant all requested scopes.

**Solution**:
1. Make scopes optional when possible
2. Check which scopes were actually granted:
```typescript
const { data } = await authlane.connections.get({
  userId,
  serviceId,
});
console.log('Granted scopes:', data.grantedScopes);
```
3. Request missing scopes in another authorization

## Tool Execution Issues

### "Tool not found"

**Error Code**: `TOOL_NOT_FOUND`

**Causes**:
- Tool name is misspelled
- Tool doesn't exist for this service
- Service is disabled

**Solution**:
```typescript
// List available tools
const { data: tools } = await authlane.tools.list({
  userId,
  format: 'openai',
});
console.log('Available tools:', tools.tools.map(t => t.function.name));
```

### "Invalid parameters"

**Error Code**: `INVALID_PARAMETERS`

**Cause**: Tool parameters don't match the schema.

**Solution**:
```typescript
// Get tool schema
const { data: tools } = await authlane.tools.list({
  userId,
  format: 'openai',
});
const tool = tools.tools.find(t => t.function.name === 'github_create_issue');
console.log('Required parameters:', tool.function.parameters);
```

### "Provider error"

**Error Code**: `PROVIDER_ERROR`

**Cause**: External service returned an error.

**Solution**:
- Check the error details for service-specific message
- Verify the service is operational
- Check rate limits
- Verify permissions/scopes

## Rate Limiting

### "Too many requests"

**Error Code**: `RATE_LIMITED`

**Solution**:
```typescript
if (error?.code === 'RATE_LIMITED') {
  const retryAfter = error.headers?.['retry-after'] || 60;
  console.log(`Rate limited. Retry after ${retryAfter} seconds`);
  // Implement exponential backoff
}
```

### Handling Rate Limits

```typescript
async function withRetry(fn: () => Promise<any>, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.code === 'RATE_LIMITED' && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
```

## Self-Hosted Issues

### Database Connection Failed

**Causes**:
- DATABASE_URL is incorrect
- PostgreSQL is not running
- Network/firewall issues

**Solution**:
```bash
# Check PostgreSQL is running
docker compose ps

# Verify connection
psql $DATABASE_URL -c "SELECT 1"

# Check logs
docker compose logs db
```

### Redis Connection Failed

**Causes**:
- REDIS_URL is incorrect
- Redis is not running
- Network issues

**Solution**:
```bash
# Check Redis is running
docker compose ps redis

# Verify connection
redis-cli -u $REDIS_URL PING
```

### Encryption Key Issues

**Causes**:
- ENCRYPTION_KEY not set
- Key is not 32 bytes (base64)
- Key was changed after storing data

**Solution**:
```bash
# Generate proper key
openssl rand -base64 32

# Set in environment
export ENCRYPTION_KEY="your-32-byte-key-base64-encoded"
```

**Warning**: Changing the encryption key will make existing credentials unreadable.

## Debugging Tips

### Enable Debug Logging

```typescript
const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY,
  debug: true, // Enable verbose logging
});
```

### Check Connection Health

```typescript
const { data } = await authlane.connections.healthCheck({
  userId,
  serviceId,
});

console.log('Connection status:', data);
// { status: 'healthy', lastVerified: '2025-01-15T10:00:00Z' }
```

### Inspect Request/Response

```typescript
const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY,
  onRequest: (req) => console.log('Request:', req),
  onResponse: (res) => console.log('Response:', res),
});
```

## Getting Help

If you can't resolve the issue:

1. **Check Documentation**: [docs.authlane.com](https://docs.authlane.com)
2. **Search Issues**: [github.com/authlane/authlane/issues](https://github.com/authlane/authlane/issues)
3. **Community Discord**: [discord.gg/authlane](https://discord.gg/authlane)
4. **Create Issue**: Include:
   - Error code and message
   - Steps to reproduce
   - Environment (self-hosted/cloud, versions)
