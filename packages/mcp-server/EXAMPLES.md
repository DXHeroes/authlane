# Authlane MCP Server - Usage Examples

## Example 1: GitHub Integration

### Setup
1. Connect GitHub through Authlane Dashboard
2. Configure MCP server in Claude Desktop
3. Restart Claude Desktop

### Usage in Claude Desktop

**Create an issue:**
```
User: Create a GitHub issue in my-org/my-repo with title "Bug: Login not working"
      and body "Users are unable to log in after the latest deployment"

Claude: I'll create that issue for you using the github_create_issue tool.
        [Tool executes]
        ✓ Created issue #123 in my-org/my-repo
```

**List open issues:**
```
User: Show me all open issues in my-org/my-repo

Claude: [Uses github_list_issues tool]
        Here are the open issues:
        1. Bug: Login not working (#123)
        2. Feature: Add dark mode (#122)
        ...
```

## Example 2: Slack Integration

### Setup
1. Connect Slack workspace through Authlane
2. Grant necessary permissions (chat:write, channels:read)
3. Configure MCP server

### Usage

**Send a message:**
```
User: Send a message to #engineering channel saying "Deploy completed successfully"

Claude: [Uses slack_send_message tool]
        ✓ Message sent to #engineering
```

**List channels:**
```
User: What Slack channels do I have access to?

Claude: [Uses slack_list_channels tool]
        You have access to:
        - #general
        - #engineering
        - #design
        ...
```

## Example 3: Linear Integration

### Setup
1. Connect Linear workspace
2. Configure MCP server

### Usage

**Create a task:**
```
User: Create a Linear task: "Implement user authentication"
      in the Backend team

Claude: [Uses linear_create_issue tool]
        ✓ Created task LIN-456: Implement user authentication
        Assigned to: Backend team
```

## Example 4: Multi-Service Workflow

### Scenario: Bug Report to Issue Pipeline

```
User: I received an email about a critical bug.
      1. Search for emails with subject "Critical Bug"
      2. Create a GitHub issue based on the email content
      3. Send a Slack notification to #engineering

Claude: I'll help you with that multi-step workflow.

        Step 1: Searching emails...
        [Uses gmail_search_emails tool]
        Found 1 email with subject "Critical Bug: Payment failing"

        Step 2: Creating GitHub issue...
        [Uses github_create_issue tool]
        ✓ Created issue #789 "Critical Bug: Payment failing"

        Step 3: Sending Slack notification...
        [Uses slack_send_message tool]
        ✓ Notified #engineering about issue #789

        All done! Issue #789 has been created and the team has been notified.
```

## Example 5: Gmail + Google Calendar Integration

### Scenario: Meeting Scheduler

```
User: Find all emails from john@example.com in the last week and
      create a calendar event for our next meeting

Claude: Let me help with that.

        Step 1: Searching emails from john@example.com...
        [Uses gmail_search_emails tool]
        Found 3 emails mentioning "meeting next Tuesday at 2pm"

        Step 2: Creating calendar event...
        [Uses gcal_create_event tool]
        ✓ Created event "Meeting with John" on Tuesday, 2:00 PM - 3:00 PM

        Calendar event created successfully!
```

## Example 6: Self-Hosted Configuration

### For Kubernetes Deployment

```json
{
  "mcpServers": {
    "authlane": {
      "command": "npx",
      "args": ["-y", "@authlane/mcp-server"],
      "env": {
        "AUTHLANE_API_KEY": "al_key_xxxxx",
        "AUTHLANE_USER_ID": "user_123",
        "AUTHLANE_BASE_URL": "https://authlane.mycompany.com"
      }
    }
  }
}
```

### For Docker Compose

```json
{
  "mcpServers": {
    "authlane": {
      "command": "npx",
      "args": ["-y", "@authlane/mcp-server"],
      "env": {
        "AUTHLANE_API_KEY": "al_key_xxxxx",
        "AUTHLANE_USER_ID": "user_123",
        "AUTHLANE_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

## Example 7: Multiple Tenants

You can configure multiple MCP servers for different tenants:

```json
{
  "mcpServers": {
    "authlane-personal": {
      "command": "npx",
      "args": ["-y", "@authlane/mcp-server"],
      "env": {
        "AUTHLANE_API_KEY": "al_key_personal",
        "AUTHLANE_USER_ID": "personal_user"
      }
    },
    "authlane-work": {
      "command": "npx",
      "args": ["-y", "@authlane/mcp-server"],
      "env": {
        "AUTHLANE_API_KEY": "al_key_work",
        "AUTHLANE_USER_ID": "work_user"
      }
    }
  }
}
```

Now you can specify which context to use:
```
User: (using authlane-personal) Create a GitHub issue in my personal repo
User: (using authlane-work) Send a Slack message to the work channel
```

## Example 8: Development & Testing

### Local API Testing

```bash
# Terminal 1: Start local Authlane API
cd authlane
pnpm dev

# Terminal 2: Test MCP server
export AUTHLANE_API_KEY="test_key"
export AUTHLANE_USER_ID="test_user"
export AUTHLANE_BASE_URL="http://localhost:3000"

cd packages/mcp-server
pnpm dev
```

### Claude Desktop Configuration for Local Testing

```json
{
  "mcpServers": {
    "authlane-dev": {
      "command": "node",
      "args": ["/Users/yourname/authlane/packages/mcp-server/dist/index.js"],
      "env": {
        "AUTHLANE_API_KEY": "test_key",
        "AUTHLANE_USER_ID": "test_user",
        "AUTHLANE_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

## Tips & Best Practices

### 1. Organize by Context
Configure multiple MCP servers for different contexts (work, personal, projects)

### 2. Use Descriptive Names
Give your MCP server instances descriptive names in the config

### 3. Secure Your API Keys
- Never commit API keys to version control
- Use environment variables for production deployments
- Rotate keys regularly

### 4. Monitor Usage
- Check Authlane Dashboard for API usage
- Set up alerts for rate limits
- Monitor tool execution success rates

### 5. Test Before Production
- Test with self-hosted instance first
- Verify all connected services work correctly
- Check error handling with invalid inputs

## Common Patterns

### Pattern 1: Search → Process → Notify
1. Search for information (Gmail, Linear, etc.)
2. Process and create artifacts (GitHub issues, documents)
3. Notify stakeholders (Slack, email)

### Pattern 2: Sync Across Services
1. Monitor one service for updates
2. Sync changes to other services
3. Keep everything in sync

### Pattern 3: Automated Reporting
1. Gather data from multiple sources
2. Compile reports
3. Distribute via email/Slack

## Troubleshooting Examples

### "Tool not found"
**Problem:** Claude says a tool isn't available
**Solution:** Verify the service is connected in Authlane Dashboard

### "Permission denied"
**Problem:** Tool executes but returns permission error
**Solution:** Re-authenticate the service with broader scopes

### "Rate limit exceeded"
**Problem:** Getting rate limit errors
**Solution:** Check Authlane Dashboard for current usage and limits

## Next Steps

1. Try the examples above
2. Create your own workflows
3. Share your use cases with the community
4. Contribute examples to the documentation

## Resources

- [Authlane MCP Server README](./README.md)
- [Integration Guide](./INTEGRATION.md)
- [Authlane Documentation](https://authlane.com/docs)
- [Claude Desktop Documentation](https://claude.ai/desktop)
