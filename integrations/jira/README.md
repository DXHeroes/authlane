# Jira Integration

This integration enables OAuth 2.0 authentication with Jira Cloud using Atlassian's 3-legged OAuth (3LO) flow.

## Features

- OAuth 2.0 (3LO) authentication with PKCE
- Support for Jira Cloud instances
- Tools for managing issues, transitions, and comments
- Automatic token refresh

## OAuth Setup

### 1. Create an OAuth 2.0 App in Atlassian Developer Console

1. Go to [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
2. Click **Create** → **OAuth 2.0 integration**
3. Fill in the app details:
   - **App name**: Your application name (e.g., "Authlane Dev")
   - **Description**: Optional description

### 2. Configure OAuth 2.0 (3LO)

1. In your app, go to **Authorization** tab
2. Click **Add** under **OAuth 2.0 (3LO)**
3. Configure the callback URL:
   ```
   http://localhost:3000/api/v1/users/{userId}/connections/jira/callback
   ```
   For production, replace with your domain:
   ```
   https://api.yourdomain.com/api/v1/users/{userId}/connections/jira/callback
   ```

### 3. Configure Permissions

In the **Permissions** tab, add the following scopes:

#### Required Scopes:
- `read:jira-work` - Read Jira project and issue data
- `write:jira-work` - Create and edit issues, comments, and transitions
- `read:jira-user` - Read user information
- `offline_access` - Refresh tokens for long-lived access

### 4. Get Client Credentials

1. Go to **Settings** tab
2. Copy your **Client ID** and **Secret**
3. Store them securely in your environment variables:
   ```bash
   export JIRA_CLIENT_ID="your_client_id"
   export JIRA_CLIENT_SECRET="your_client_secret"
   ```

### 5. Enable the App

1. In the **Distribution** tab, ensure your app is set to development mode
2. For production, submit for review according to Atlassian guidelines

## Testing OAuth Flow

Run the test script to verify your Jira OAuth setup:

```bash
export API_KEY="your_api_key"
export JIRA_CLIENT_ID="your_jira_client_id"
export JIRA_CLIENT_SECRET="your_jira_client_secret"

./scripts/test-jira-oauth.sh
```

The script will:
1. Initiate OAuth authorization
2. Open the Jira authorization URL
3. Exchange authorization code for tokens
4. Verify credentials are encrypted and stored
5. Test credentials with Jira API
6. Run health check

## Available Tools

### jira_create_issue

Creates a new issue in a Jira project.

**Parameters:**
- `projectKey` (required) - Project key (e.g., "PROJ")
- `summary` (required) - Issue title/summary
- `issueType` (required) - Issue type (Bug, Task, Story, Epic)
- `description` (optional) - Issue description
- `priority` (optional) - Priority (Highest, High, Medium, Low, Lowest)
- `assigneeAccountId` (optional) - Assignee account ID
- `labels` (optional) - Array of labels
- `components` (optional) - Array of component names/IDs
- `dueDate` (optional) - Due date (YYYY-MM-DD)

### jira_list_issues

Lists issues using JQL (Jira Query Language) or simple filters.

**Parameters:**
- `jql` (optional) - JQL query string
- `projectKey` (optional) - Filter by project
- `assigneeAccountId` (optional) - Filter by assignee
- `status` (optional) - Filter by status
- `maxResults` (optional) - Max results (default: 50, max: 100)
- `startAt` (optional) - Pagination offset
- `fields` (optional) - Array of fields to include

### jira_transition_issue

Transitions an issue to a different status.

**Parameters:**
- `issueKey` (required) - Issue key (e.g., "PROJ-123")
- `transitionId` (optional) - Transition ID
- `transitionName` (optional) - Transition name (alternative to ID)
- `comment` (optional) - Comment to add during transition
- `assigneeAccountId` (optional) - Reassign during transition
- `resolution` (optional) - Resolution when closing

### jira_get_transitions

Gets available transitions for an issue.

**Parameters:**
- `issueKey` (required) - Issue key (e.g., "PROJ-123")

### jira_update_issue

Updates an existing issue.

**Parameters:**
- `issueKey` (required) - Issue key
- `summary` (optional) - New summary
- `description` (optional) - New description
- `priority` (optional) - New priority
- `assigneeAccountId` (optional) - New assignee
- `labels` (optional) - New labels array
- `dueDate` (optional) - New due date

### jira_add_comment

Adds a comment to an issue.

**Parameters:**
- `issueKey` (required) - Issue key
- `comment` (required) - Comment text

## Usage Examples

### MCP Format

```json
{
  "tools": [
    {
      "name": "jira_create_issue",
      "description": "Creates a new issue in a Jira project",
      "inputSchema": {
        "type": "object",
        "properties": {
          "projectKey": { "type": "string" },
          "summary": { "type": "string" },
          "issueType": { "type": "string" }
        },
        "required": ["projectKey", "summary", "issueType"]
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
      "name": "jira_create_issue",
      "description": "Creates a new issue in a Jira project",
      "parameters": {
        "type": "object",
        "properties": {
          "projectKey": { "type": "string" },
          "summary": { "type": "string" },
          "issueType": { "type": "string" }
        },
        "required": ["projectKey", "summary", "issueType"]
      }
    }
  ]
}
```

## API Endpoints

### Get Jira Tools

```bash
GET /api/v1/users/{userId}/tools?format=mcp&service=jira
```

### Authorize Jira Connection

```bash
GET /api/v1/users/{userId}/connections/jira/authorize?client_id={clientId}&redirect_uri={redirectUri}
```

### OAuth Callback

```bash
GET /api/v1/users/{userId}/connections/jira/callback?code={code}&state={state}
```

## Resources

- [Atlassian OAuth 2.0 (3LO) Documentation](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/)
- [Jira Cloud REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [JQL Reference](https://support.atlassian.com/jira-software-cloud/docs/use-advanced-search-with-jira-query-language-jql/)
- [Atlassian Scopes](https://developer.atlassian.com/cloud/jira/platform/scopes-for-oauth-2-3LO-and-forge-apps/)

## Troubleshooting

### "Invalid redirect_uri" error

Ensure your callback URL exactly matches the one configured in Atlassian Developer Console, including the protocol (http/https) and path.

### "Insufficient scope" error

Verify that all required scopes are enabled in the Permissions tab of your Atlassian app.

### Token refresh fails

Ensure you requested the `offline_access` scope during authorization to receive a refresh token.

### "Accessible resources" returns empty array

The user needs to grant access to at least one Jira site. During OAuth authorization, they must select which Jira instances to connect.
