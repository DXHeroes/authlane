# Linear Integration

This integration provides OAuth authentication and tool definitions for Linear, the issue tracking and project management platform.

## Features

- **OAuth 2.0 Authentication**: Secure authentication flow with Linear
- **MCP & OpenAI Tool Formats**: Tools available in both Model Context Protocol and OpenAI function calling formats
- **Issue Management**: Create, list, and update Linear issues

## Tools

### linear_create_issue
Creates a new issue in a Linear team.

**Parameters:**
- `teamId` (required): Team ID where the issue will be created
- `title` (required): Issue title
- `description` (optional): Issue description (supports markdown)
- `priority` (optional): Issue priority (0-4, where 0 is no priority and 4 is urgent)
- `stateId` (optional): State ID for the issue
- `assigneeId` (optional): User ID to assign the issue to
- `labelIds` (optional): Array of label IDs to apply to the issue

### linear_list_issues
Lists issues from Linear workspace with optional filters.

**Parameters:**
- `teamId` (optional): Filter issues by team ID
- `assigneeId` (optional): Filter issues by assignee ID
- `state` (optional): Filter by state name (e.g., "Todo", "In Progress", "Done")
- `limit` (optional): Maximum number of issues to return (default: 50)
- `includeArchived` (optional): Include archived issues in results (default: false)

### linear_update_issue
Updates an existing Linear issue.

**Parameters:**
- `issueId` (required): Issue ID to update
- `title` (optional): New issue title
- `description` (optional): New issue description
- `priority` (optional): New priority (0-4)
- `stateId` (optional): New state ID
- `assigneeId` (optional): New assignee ID
- `labelIds` (optional): New array of label IDs

## OAuth Configuration

### Setting up a Linear OAuth Application

1. Go to [Linear Settings > API](https://linear.app/settings/api)
2. Click "Create new OAuth application"
3. Fill in the application details:
   - **Name**: Your application name (e.g., "Authlane")
   - **Callback URL**: Your Authlane callback URL (e.g., `http://localhost:3000/api/v1/oauth/callback`)
4. Copy the **Client ID** and **Client Secret**
5. Configure these in your Authlane tenant settings

### Required Scopes

The default scopes for this integration are:
- `read`: Read access to workspace data
- `write`: Write access to workspace data

Additional available scopes:
- `issues:create`: Create issues
- `admin`: Admin access (use with caution)

## Testing

To test the Linear integration:

```bash
cd integrations/linear
pnpm exec tsx test-load.mjs
```

This will verify that tools can be loaded in both MCP and OpenAI formats.

## OAuth Flow

1. User initiates connection via Authlane API: `POST /api/v1/users/{userId}/connections`
2. Authlane redirects to Linear authorization URL with PKCE challenge
3. User authorizes the application on Linear
4. Linear redirects back to Authlane callback URL with authorization code
5. Authlane exchanges code for access token using PKCE verifier
6. Access token is encrypted and stored securely
7. Connection is marked as "connected"

## API Endpoints

Linear uses the following OAuth endpoints:
- **Authorization URL**: `https://linear.app/oauth/authorize`
- **Token URL**: `https://api.linear.app/oauth/token`
- **API Base URL**: `https://api.linear.app/graphql` (Linear uses GraphQL API)

## References

- [Linear OAuth Documentation](https://developers.linear.app/docs/oauth)
- [Linear GraphQL API](https://developers.linear.app/docs/graphql/working-with-the-graphql-api)
- [Linear SDK](https://github.com/linear/linear)
