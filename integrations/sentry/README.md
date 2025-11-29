# Sentry Integration

This integration enables OAuth 2.0 authentication with Sentry for accessing error tracking and monitoring data.

## Features

- OAuth 2.0 authentication with PKCE
- Support for Sentry.io and self-hosted Sentry instances
- Tools for managing issues and events
- Read and write access to Sentry projects

## OAuth Setup

### 1. Create a Sentry Integration

1. Go to [Sentry Developer Settings](https://sentry.io/settings/account/api/auth-tokens/)
2. Navigate to **Organization Settings** → **Developer Settings** → **Internal Integrations**
3. Click **New Internal Integration**
4. Fill in the integration details:
   - **Name**: Your application name (e.g., "Authlane Dev")
   - **Webhook URL**: Optional (can be left blank for read-only access)
   - **Redirect URL**: Add your callback URL

### 2. Configure Callback URL

Add the following callback URL to your Sentry integration:

```
http://localhost:3000/api/v1/users/{userId}/connections/sentry/callback
```

For production, replace with your domain:
```
https://api.yourdomain.com/api/v1/users/{userId}/connections/sentry/callback
```

### 3. Configure Permissions

In the **Permissions** section, grant the following:

#### Required Permissions:
- **Project** → Read
- **Project** → Write (if you want to modify project settings)
- **Event** → Read (to access error events)
- **Event** → Write (to resolve/ignore issues)
- **Issue & Event** → Admin (optional, for full control)

### 4. Get Client Credentials

1. After creating the integration, you'll see:
   - **Client ID**
   - **Client Secret**
2. Store them securely in your environment variables:
   ```bash
   export SENTRY_CLIENT_ID="your_client_id"
   export SENTRY_CLIENT_SECRET="your_client_secret"
   ```

### 5. Verify & Install

1. Click **Save Changes** to create the integration
2. The integration will be available for installation in your organization

## Testing OAuth Flow

Run the test script to verify your Sentry OAuth setup:

```bash
export API_KEY="your_api_key"
export SENTRY_CLIENT_ID="your_sentry_client_id"
export SENTRY_CLIENT_SECRET="your_sentry_client_secret"

./scripts/test-sentry-oauth.sh
```

The script will:
1. Initiate OAuth authorization
2. Open the Sentry authorization URL
3. Exchange authorization code for tokens
4. Verify credentials are encrypted and stored
5. Test credentials with Sentry API
6. Run health check

## Available Tools

### sentry_list_issues

Lists issues from Sentry with optional filters.

**Parameters:**
- `organizationSlug` (required) - Organization slug (e.g., "my-organization")
- `projectSlug` (optional) - Filter by project slug
- `query` (optional) - Search query using Sentry syntax (e.g., "is:unresolved")
- `status` (optional) - Filter by status (resolved, unresolved, ignored, reprocessing)
- `statsPeriod` (optional) - Time period for stats (e.g., "14d", "24h", default: "14d")
- `limit` (optional) - Max results (default: 25, max: 100)
- `cursor` (optional) - Pagination cursor
- `sortBy` (optional) - Sort order (date, new, priority, freq, user)

**Example:**
```json
{
  "organizationSlug": "my-org",
  "projectSlug": "my-project",
  "query": "is:unresolved level:error",
  "limit": 50
}
```

### sentry_resolve_issue

Resolves or updates the status of a Sentry issue.

**Parameters:**
- `issueId` (required) - Sentry issue ID
- `status` (required) - New status (resolved, unresolved, ignored)
- `statusDetails` (optional) - Additional details:
  - `inNextRelease` - Mark as resolved in next release
  - `inRelease` - Version number to mark as resolved in
  - `inCommit` - Commit hash that resolves this issue
  - `ignoreDuration` - Minutes to ignore the issue
  - `ignoreCount` - Number of events before unignoring
  - `ignoreUserCount` - Number of users affected before unignoring
  - `ignoreWindow` - Time window in minutes for ignore conditions
- `assignedTo` (optional) - User ID or team slug to assign to

**Example:**
```json
{
  "issueId": "123456789",
  "status": "resolved",
  "statusDetails": {
    "inNextRelease": true
  }
}
```

### sentry_get_issue

Gets detailed information about a specific Sentry issue.

**Parameters:**
- `issueId` (required) - Sentry issue ID

### sentry_list_events

Lists events for a specific issue.

**Parameters:**
- `issueId` (required) - Sentry issue ID
- `limit` (optional) - Max results (default: 25, max: 100)
- `cursor` (optional) - Pagination cursor

### sentry_add_comment

Adds a comment to a Sentry issue.

**Parameters:**
- `issueId` (required) - Sentry issue ID
- `comment` (required) - Comment text

## Usage Examples

### MCP Format

```json
{
  "tools": [
    {
      "name": "sentry_list_issues",
      "description": "Lists issues from Sentry with optional filters",
      "inputSchema": {
        "type": "object",
        "properties": {
          "organizationSlug": { "type": "string" },
          "projectSlug": { "type": "string" },
          "status": { "type": "string" }
        },
        "required": ["organizationSlug"]
      }
    }
  ]
}
```

### OpenAI Function Calling Format

```json
{
  "functions": [
    {
      "name": "sentry_list_issues",
      "description": "Lists issues from Sentry with optional filters",
      "parameters": {
        "type": "object",
        "properties": {
          "organizationSlug": { "type": "string" },
          "projectSlug": { "type": "string" },
          "status": { "type": "string" }
        },
        "required": ["organizationSlug"]
      }
    }
  ]
}
```

## API Endpoints

### Get Sentry Tools

```bash
GET /api/v1/users/{userId}/tools?format=mcp&service=sentry
```

### Authorize Sentry Connection

```bash
GET /api/v1/users/{userId}/connections/sentry/authorize?client_id={clientId}&redirect_uri={redirectUri}
```

### OAuth Callback

```bash
GET /api/v1/users/{userId}/connections/sentry/callback?code={code}&state={state}
```

## Resources

- [Sentry API Documentation](https://docs.sentry.io/api/)
- [Sentry OAuth Documentation](https://docs.sentry.io/api/auth/)
- [Sentry Integration Platform](https://docs.sentry.io/product/integrations/integration-platform/)
- [Sentry Search Query Syntax](https://docs.sentry.io/product/sentry-basics/search/)

## Troubleshooting

### "Invalid redirect_uri" error

Ensure your callback URL exactly matches the one configured in your Sentry integration, including the protocol (http/https) and path.

### "Insufficient permissions" error

Verify that all required permissions are granted in your Sentry integration settings.

### API returns 403 Forbidden

Check that:
1. Your OAuth token is valid and not expired
2. The organization slug is correct
3. The user has access to the requested organization/project

### "Organization not found" error

Ensure you're using the organization **slug** (URL-friendly identifier) and not the organization name. You can find this in your Sentry organization URL: `https://sentry.io/organizations/{slug}/`

## Self-Hosted Sentry

For self-hosted Sentry instances, update the OAuth URLs in `config.yaml`:

```yaml
config:
  authorization_url: https://your-sentry-instance.com/oauth/authorize/
  token_url: https://your-sentry-instance.com/oauth/token/
```
