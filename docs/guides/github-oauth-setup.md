# GitHub OAuth Setup Guide

This guide walks you through setting up GitHub OAuth integration with Authlane, from creating a GitHub OAuth App to testing the complete OAuth flow.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Part 1: Create GitHub OAuth App](#part-1-create-github-oauth-app)
- [Part 2: Configure Authlane](#part-2-configure-authlane)
- [Part 3: Test OAuth Flow](#part-3-test-oauth-flow)
- [Part 4: Production Setup](#part-4-production-setup)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)

## Prerequisites

Before you begin, ensure you have:

- A GitHub account
- Authlane API running (locally or deployed)
- Valid Authlane API key (get it from `pnpm --filter @authlane/database seed`)
- Basic understanding of OAuth 2.0 flow

## Part 1: Create GitHub OAuth App

### Step 1: Navigate to GitHub OAuth Apps Settings

1. Go to GitHub Settings: https://github.com/settings/developers
2. Click on **OAuth Apps** in the left sidebar
3. Click the **New OAuth App** button

### Step 2: Fill in Application Details

Configure your OAuth App with the following information:

| Field | Development Value | Production Value |
|-------|------------------|------------------|
| **Application name** | `Authlane Dev` | `Your App Name` |
| **Homepage URL** | `http://localhost:3000` | `https://yourdomain.com` |
| **Application description** | (Optional) Testing Authlane integration | Your app description |
| **Authorization callback URL** | `http://localhost:3000/api/v1/users/{userId}/connections/github/callback` | `https://api.yourdomain.com/api/v1/users/{userId}/connections/github/callback` |

> **Important:** The callback URL must match exactly what you send in the authorization request. The `{userId}` will be replaced with actual user IDs at runtime.

### Step 3: Register the Application

1. Click **Register application**
2. You'll be redirected to your new OAuth App's page
3. Copy the **Client ID** (you'll need this)
4. Click **Generate a new client secret**
5. Copy the **Client Secret** immediately (it won't be shown again)

> **Security Warning:** Never commit your Client Secret to version control. Store it securely in environment variables.

### Step 4: Save Credentials

Create a `.env.local` file in your project root:

```bash
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
```

Add this file to `.gitignore`:

```bash
echo ".env.local" >> .gitignore
```

## Part 2: Configure Authlane

### Option A: Use Query Parameters (Quick Testing)

For quick testing, you can pass OAuth credentials as query parameters:

```bash
# Start authorization
curl -H "Authorization: Bearer $API_KEY" \
  "http://localhost:3000/api/v1/users/user_123/connections/github/authorize?client_id=$GITHUB_CLIENT_ID&redirect_uri=http://localhost:3000/api/v1/users/user_123/connections/github/callback"
```

### Option B: Configure Tenant-Specific OAuth (Recommended)

For production use, configure OAuth credentials at the tenant level:

#### Using the API:

```bash
# Create tenant-specific service configuration
curl -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "service_id": "github",
    "enabled": true,
    "oauth_client_id": "'"$GITHUB_CLIENT_ID"'",
    "oauth_client_secret": "'"$GITHUB_CLIENT_SECRET"'",
    "custom_scopes": ["repo", "user", "read:org"]
  }' \
  "http://localhost:3000/api/v1/tenant/services"
```

#### Using Database Directly:

```sql
-- Insert tenant-specific GitHub configuration
INSERT INTO tenant_services (
  id,
  tenant_id,
  service_id,
  enabled,
  oauth_client_id,
  oauth_client_secret_enc,
  custom_scopes
) VALUES (
  gen_random_uuid(),
  'your-tenant-id',
  'github',
  true,
  'your_github_client_id',
  encrypt_credential('your_github_client_secret'),  -- Use encryption function
  ARRAY['repo', 'user', 'read:org']
);
```

### Understanding OAuth Scopes

GitHub OAuth scopes control what your app can access:

| Scope | Access Level | Required For |
|-------|-------------|--------------|
| `repo` | Full control of private repositories | Creating issues, PRs, reading code |
| `user` | Read user profile data | Getting user info, email |
| `read:org` | Read organization membership | Listing user's organizations |
| `workflow` | Update GitHub Actions workflows | Modifying CI/CD workflows |
| `gist` | Create and read gists | Gist management |

**Default scopes for Authlane:** `repo`, `user`, `read:org`

> **Tip:** Request only the scopes you actually need. Users are more likely to authorize apps that request minimal permissions.

## Part 3: Test OAuth Flow

### Method 1: Using the Test Script (Recommended)

Authlane provides an interactive test script:

```bash
# Set environment variables
export API_KEY="your_api_key"
export GITHUB_CLIENT_ID="your_client_id"
export GITHUB_CLIENT_SECRET="your_client_secret"

# Run the test script
./scripts/test-oauth.sh
```

The script will:
1. ✅ Verify API health
2. ✅ Check GitHub service configuration
3. ✅ Initiate OAuth authorization
4. 🔗 Provide authorization URL (open in browser)
5. ✅ Wait for you to authorize
6. ✅ Exchange code for tokens
7. ✅ Verify credentials are stored encrypted
8. ✅ Test credentials with GitHub API
9. ✅ Run health check

### Method 2: Manual Testing

#### Step 1: Initiate Authorization

```bash
curl -H "Authorization: Bearer $API_KEY" \
  "http://localhost:3000/api/v1/users/user_123/connections/github/authorize?client_id=$GITHUB_CLIENT_ID" \
  | jq .
```

Response:
```json
{
  "data": {
    "authorization_url": "https://github.com/login/oauth/authorize?client_id=...",
    "state": "state_xyz...",
    "connection_id": "conn_abc..."
  },
  "error": null
}
```

#### Step 2: Authorize in Browser

1. Copy the `authorization_url` from the response
2. Open it in your browser
3. Click **Authorize [Your App Name]**
4. GitHub will redirect you to the callback URL with a `code` parameter

Example callback:
```
http://localhost:3000/api/v1/users/user_123/connections/github/callback?code=abc123def456&state=state_xyz...
```

#### Step 3: Exchange Code for Tokens (Automatic)

The callback URL automatically exchanges the code for tokens. If you're testing manually:

```bash
# Extract code and state from callback URL
CODE="abc123def456"
STATE="state_xyz..."

curl -H "Authorization: Bearer $API_KEY" \
  "http://localhost:3000/api/v1/users/user_123/connections/github/callback?code=$CODE&state=$STATE&client_id=$GITHUB_CLIENT_ID&client_secret=$GITHUB_CLIENT_SECRET" \
  | jq .
```

Response:
```json
{
  "data": {
    "connection_id": "conn_abc...",
    "status": "connected",
    "service": "github"
  },
  "error": null
}
```

#### Step 4: Verify Connection

```bash
curl -H "Authorization: Bearer $API_KEY" \
  "http://localhost:3000/api/v1/users/user_123/connections/github" \
  | jq .
```

Response:
```json
{
  "data": {
    "id": "conn_abc...",
    "service_id": "github",
    "status": "connected",
    "connected_at": "2025-11-27T10:00:00Z",
    "expires_at": null,
    "credentials_enc": "encrypted_data..."
  },
  "error": null
}
```

#### Step 5: Retrieve Credentials

```bash
curl -H "Authorization: Bearer $API_KEY" \
  "http://localhost:3000/api/v1/users/user_123/connections/github/credentials" \
  | jq .
```

Response:
```json
{
  "data": {
    "access_token": "gho_abc123...",
    "token_type": "Bearer",
    "scope": "repo,user,read:org"
  },
  "error": null
}
```

#### Step 6: Test with GitHub API

```bash
# Get authenticated user info
ACCESS_TOKEN="gho_abc123..."

curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://api.github.com/user" \
  | jq .
```

## Part 4: Production Setup

### Environment Variables

Set these in your production environment:

```bash
# API Configuration
API_URL=https://api.yourdomain.com
DATABASE_URL=postgresql://user:pass@host:5432/authlane
REDIS_URL=redis://host:6379
ENCRYPTION_KEY=<64-character-hex-key>

# GitHub OAuth (if using query params method)
GITHUB_CLIENT_ID=your_production_client_id
GITHUB_CLIENT_SECRET=your_production_client_secret
```

### GitHub OAuth App Settings

Update your GitHub OAuth App for production:

1. Go to https://github.com/settings/developers
2. Select your OAuth App
3. Update **Homepage URL**: `https://yourdomain.com`
4. Update **Authorization callback URL**: `https://api.yourdomain.com/api/v1/users/{userId}/connections/github/callback`
5. Save changes

### Security Checklist

- [ ] Client Secret stored in secure environment variables
- [ ] HTTPS enabled for production API
- [ ] Callback URL uses HTTPS (not HTTP)
- [ ] ENCRYPTION_KEY is cryptographically random (64 hex chars)
- [ ] Rate limiting enabled
- [ ] CORS configured for your domain only
- [ ] Database connection uses SSL
- [ ] API key rotation policy in place

### Monitoring

Monitor these metrics:

- OAuth authorization success rate
- Token exchange failures
- Connection health status
- Token refresh job success rate
- API rate limit usage

## Troubleshooting

### Issue: "Invalid state parameter"

**Cause:** State mismatch between authorization and callback (CSRF protection)

**Solutions:**
- Ensure you're using the same state value returned from `/authorize`
- Don't manually modify the state parameter
- Check that cookies are enabled (if using session storage)
- Verify your callback URL matches exactly

### Issue: "Token exchange failed"

**Cause:** Invalid authorization code or credentials

**Solutions:**
- Ensure authorization code hasn't expired (codes expire after 10 minutes)
- Verify Client ID and Client Secret are correct
- Check that redirect_uri matches exactly between authorize and callback
- Ensure PKCE code_verifier is correctly stored and retrieved

### Issue: "Missing PKCE verifier"

**Cause:** Connection metadata doesn't contain PKCE verifier

**Solutions:**
- Ensure `/authorize` endpoint is creating the connection with metadata
- Check database connection is working
- Verify metadata JSON structure in database
- Clear and retry the OAuth flow

### Issue: "Credentials decryption failed"

**Cause:** ENCRYPTION_KEY mismatch

**Solutions:**
- Verify ENCRYPTION_KEY is the same used for encryption
- Ensure ENCRYPTION_KEY is 64 hex characters (32 bytes)
- Check environment variable is loaded correctly
- Don't rotate ENCRYPTION_KEY without re-encrypting existing credentials

### Issue: GitHub returns "redirect_uri_mismatch"

**Cause:** Callback URL doesn't match OAuth App configuration

**Solutions:**
- Check OAuth App settings on GitHub
- Ensure callback URL is exactly: `http://your-domain/api/v1/users/{userId}/connections/github/callback`
- Don't include query parameters in the registered callback URL
- Verify protocol (http vs https) matches

### Issue: "Service not found"

**Cause:** GitHub service not seeded in database

**Solutions:**
```bash
# Re-run database seed
pnpm --filter @authlane/database seed
```

Or manually insert:
```sql
INSERT INTO services (id, name, auth_type, config) VALUES (
  'github',
  'GitHub',
  'oauth2',
  '{"authorization_url": "https://github.com/login/oauth/authorize", "token_url": "https://github.com/login/oauth/access_token", "scopes": ["repo", "user", "read:org"]}'::jsonb
) ON CONFLICT (id) DO NOTHING;
```

## Security Considerations

### PKCE (Proof Key for Code Exchange)

Authlane implements PKCE by default to protect against authorization code interception:

1. **Code Verifier:** Random 43-128 character string stored securely
2. **Code Challenge:** SHA256 hash of code verifier
3. **Verification:** GitHub validates verifier matches challenge during token exchange

### State Parameter

The state parameter prevents CSRF attacks:

- Cryptographically random value generated per authorization
- Stored with connection in database
- Verified during callback
- Mismatches are rejected with error

### Credential Encryption

All OAuth credentials are encrypted at rest:

- **Algorithm:** AES-256-GCM
- **Key Management:** ENCRYPTION_KEY environment variable
- **Key Size:** 256 bits (32 bytes, 64 hex chars)
- **Storage:** Only encrypted credentials stored in database

### Token Storage Best Practices

1. **Never log tokens:** Ensure logging doesn't capture credentials
2. **Use HTTPS:** Always transmit tokens over encrypted connections
3. **Rotate API keys:** Implement key rotation policy
4. **Monitor access:** Track credential access patterns
5. **Scope minimization:** Request only necessary OAuth scopes

### OAuth Security Checklist

- [x] PKCE implemented (S256 method)
- [x] State parameter validated
- [x] Redirect URI exact matching
- [x] Credentials encrypted at rest (AES-256-GCM)
- [x] HTTPS enforced in production
- [x] Client Secret stored securely (env vars, not code)
- [x] Token refresh automated
- [x] Connection health monitoring
- [x] Rate limiting enabled
- [x] Error messages don't leak sensitive data

## Advanced Configuration

### Custom OAuth Scopes Per User

You can request different scopes for different users:

```bash
# Request additional scopes
curl -H "Authorization: Bearer $API_KEY" \
  "http://localhost:3000/api/v1/users/power_user/connections/github/authorize?client_id=$GITHUB_CLIENT_ID&scopes=repo,user,read:org,workflow"
```

### Webhook Integration

Configure webhooks to receive notifications about connection events:

```bash
# Set webhook URL for tenant
curl -X PATCH \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"webhook_url": "https://yourdomain.com/webhooks/authlane"}' \
  "http://localhost:3000/api/v1/tenant"
```

Events sent:
- `connection.created`
- `connection.connected`
- `connection.refreshed`
- `connection.expired`
- `connection.deleted`

### Token Refresh (Future)

GitHub OAuth tokens don't expire by default, but when using GitHub Apps with expiring tokens:

```bash
# Manual refresh (when implemented)
curl -X POST \
  -H "Authorization: Bearer $API_KEY" \
  "http://localhost:3000/api/v1/users/user_123/connections/github/refresh"
```

Automatic refresh via BullMQ job (requires Redis):
- Scheduled 5 minutes before expiration
- Retries on failure (exponential backoff)
- Webhook notification on success/failure

## Next Steps

After successfully setting up GitHub OAuth:

1. **Explore other integrations:** Linear, Slack, Notion, etc.
2. **Build your application:** Use credentials to call GitHub API
3. **Implement webhooks:** Get notified about connection events
4. **Scale to production:** Follow security checklist
5. **Monitor performance:** Track OAuth success rates

## Resources

- [GitHub OAuth Documentation](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [OAuth 2.0 RFC](https://datatracker.ietf.org/doc/html/rfc6749)
- [PKCE RFC](https://datatracker.ietf.org/doc/html/rfc7636)
- [Authlane API Reference](../api-reference.md)
- [Authlane Architecture](../architecture.md)

## Support

If you encounter issues:

1. Check [Troubleshooting](#troubleshooting) section
2. Review [GitHub OAuth logs](https://github.com/settings/developers)
3. Run test script with debug: `DEBUG=* ./scripts/test-oauth.sh`
4. Open an issue: [GitHub Issues](https://github.com/authlane/authlane/issues)
5. Join Discord: [Authlane Community](https://discord.gg/authlane)

---

**Last Updated:** November 27, 2025
**Version:** 1.0
**Maintained by:** Authlane Team
