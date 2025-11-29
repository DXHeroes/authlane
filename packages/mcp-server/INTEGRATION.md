# Authlane MCP Server Integration Guide

## Quick Start

### 1. Installation

Install the MCP server globally or locally:

```bash
# Global installation (recommended)
npm install -g @authlane/mcp-server

# Or use with npx (no installation required)
npx @authlane/mcp-server
```

### 2. Get Your Credentials

You'll need:
- **API Key**: Get from your Authlane Dashboard at Settings → API Keys
- **User ID**: The user whose connected services you want to expose

### 3. Configure Claude Desktop

Add the following to your Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "authlane": {
      "command": "npx",
      "args": ["-y", "@authlane/mcp-server"],
      "env": {
        "AUTHLANE_API_KEY": "al_key_xxxxx",
        "AUTHLANE_USER_ID": "user_123"
      }
    }
  }
}
```

### 4. Restart Claude Desktop

Restart Claude Desktop to load the MCP server. You should now see tools from all your connected services!

## Configuration Options

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `AUTHLANE_API_KEY` | Yes | Your Authlane API key | - |
| `AUTHLANE_USER_ID` | Yes | The user ID to fetch tools for | - |
| `AUTHLANE_BASE_URL` | No | Custom API base URL (for self-hosting) | `https://api.authlane.com` |

### Self-Hosted Setup

If you're running Authlane on your own infrastructure:

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

## Testing Integration

### 1. Verify Server Starts

Check Claude Desktop logs to ensure the server started successfully:

**macOS**: `~/Library/Logs/Claude/mcp*.log`

You should see: `Authlane MCP server running on stdio`

### 2. List Available Tools

In Claude Desktop, you can ask:
> "What tools do I have access to?"

Claude should list all tools from your connected services (GitHub, Slack, Linear, etc.)

### 3. Test a Tool

Try using a tool:
> "Create a GitHub issue in my-org/my-repo with title 'Test Issue'"

## Available Tools

Tools are automatically loaded based on your connected services. Examples:

### GitHub
- `github_create_issue` - Create a new issue
- `github_list_issues` - List repository issues
- `github_create_pull_request` - Create a pull request

### Slack
- `slack_send_message` - Send a message to a channel
- `slack_list_channels` - List available channels
- `slack_create_channel` - Create a new channel

### Linear
- `linear_create_issue` - Create a Linear issue
- `linear_list_issues` - List issues
- `linear_update_issue` - Update an issue

### Gmail
- `gmail_send_email` - Send an email
- `gmail_read_emails` - Read emails
- `gmail_search_emails` - Search emails

And many more! The full list depends on which services you've connected through Authlane.

## Development & Testing

### Local Development

For development, run the server directly:

```bash
# Clone the repo
git clone https://github.com/authlane/authlane.git
cd authlane/packages/mcp-server

# Install dependencies
pnpm install

# Build
pnpm build

# Set environment variables
export AUTHLANE_API_KEY="your_api_key"
export AUTHLANE_USER_ID="test_user"
export AUTHLANE_BASE_URL="http://localhost:3000"

# Run
pnpm dev
```

### Testing with Claude Desktop

Point Claude Desktop to your local build:

```json
{
  "mcpServers": {
    "authlane": {
      "command": "node",
      "args": ["/path/to/authlane/packages/mcp-server/dist/index.js"],
      "env": {
        "AUTHLANE_API_KEY": "your_api_key",
        "AUTHLANE_USER_ID": "test_user",
        "AUTHLANE_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

### Running Tests

```bash
# Run tests
pnpm test

# With coverage
pnpm test:coverage

# Type checking
pnpm type-check
```

## Troubleshooting

### No Tools Appear

**Possible causes:**
1. User has no connected services
2. API key is invalid
3. Base URL is incorrect (if self-hosting)

**Solutions:**
- Check Authlane Dashboard to verify connected services
- Verify API key in Settings → API Keys
- Check Claude Desktop logs for errors

### "Configuration error: AUTHLANE_API_KEY is required"

You haven't set the API key in the Claude Desktop config. Add it to the `env` section.

### "Configuration error: AUTHLANE_USER_ID is required"

You haven't set the user ID. Add it to the `env` section.

### Server Fails to Start

**Check:**
1. Node.js version (requires >= 18)
2. Environment variables are set correctly
3. Claude Desktop logs for detailed error messages

### Tools Execute but Return Errors

This is expected! The current implementation returns placeholder responses. Production implementation will:
1. Fetch user credentials from Authlane API
2. Call the actual service API (GitHub, Slack, etc.)
3. Return real results

## Architecture

```
┌─────────────────────────┐
│   Claude Desktop        │
│   (MCP Client)          │
└───────────┬─────────────┘
            │
            │ Model Context Protocol (stdio)
            │
┌───────────▼─────────────┐
│  @authlane/mcp-server   │
│                         │
│  - Loads tools config   │
│  - Handles tool calls   │
│  - Routes to services   │
└───────────┬─────────────┘
            │
            │ HTTPS REST API
            │
┌───────────▼─────────────┐
│   Authlane API          │
│                         │
│  - Manages connections  │
│  - Stores credentials   │
│  - Provides tool defs   │
└───────────┬─────────────┘
            │
     ┌──────┴──────┐
     │             │
┌────▼────┐   ┌───▼────┐
│ GitHub  │   │ Slack  │
│ Linear  │   │ Gmail  │
│  etc.   │   │  etc.  │
└─────────┘   └────────┘
```

## Next Steps

1. **Connect Services**: Add integrations through Authlane Dashboard
2. **Test Tools**: Try using tools in Claude Desktop
3. **Build Workflows**: Create AI workflows using your connected services
4. **Monitor Usage**: Check API usage in Authlane Dashboard

## Resources

- [Authlane Documentation](https://authlane.com/docs)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Claude Desktop](https://claude.ai/desktop)
- [GitHub Repository](https://github.com/authlane/authlane)

## Support

- GitHub Issues: https://github.com/authlane/authlane/issues
- Discord: https://discord.gg/authlane
- Email: support@authlane.com
