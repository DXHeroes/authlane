# @authlane/mcp-server

MCP (Model Context Protocol) server for Authlane - expose your connected service tools to AI frameworks like Claude Desktop.

## Overview

This package provides a Model Context Protocol server that exposes all your Authlane-connected service tools to AI applications. It dynamically loads tools from all services the user has connected through Authlane.

## Installation

### Global Installation

```bash
npm install -g @authlane/mcp-server
```

### Local Development

```bash
cd packages/mcp-server
pnpm install
pnpm build
```

## Configuration

The MCP server requires the following environment variables:

- `AUTHLANE_API_KEY` - Your Authlane API key (required)
- `AUTHLANE_USER_ID` - The user ID to fetch tools for (required)
- `AUTHLANE_BASE_URL` - Custom API base URL (optional, defaults to `https://api.authlane.com`)

## Usage

### Claude Desktop Integration

To use with Claude Desktop, add the following to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "authlane": {
      "command": "npx",
      "args": [
        "-y",
        "@authlane/mcp-server"
      ],
      "env": {
        "AUTHLANE_API_KEY": "your_api_key_here",
        "AUTHLANE_USER_ID": "your_user_id_here"
      }
    }
  }
}
```

For self-hosted Authlane instances:

```json
{
  "mcpServers": {
    "authlane": {
      "command": "npx",
      "args": [
        "-y",
        "@authlane/mcp-server"
      ],
      "env": {
        "AUTHLANE_API_KEY": "your_api_key_here",
        "AUTHLANE_USER_ID": "your_user_id_here",
        "AUTHLANE_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

### Local Development with Claude Desktop

For development, you can run the server directly from source:

```json
{
  "mcpServers": {
    "authlane": {
      "command": "node",
      "args": [
        "/path/to/authlane/packages/mcp-server/dist/index.js"
      ],
      "env": {
        "AUTHLANE_API_KEY": "your_api_key_here",
        "AUTHLANE_USER_ID": "test_user",
        "AUTHLANE_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

### Manual Testing

You can test the server manually using stdio:

```bash
# Set environment variables
export AUTHLANE_API_KEY="your_api_key"
export AUTHLANE_USER_ID="test_user"
export AUTHLANE_BASE_URL="http://localhost:3000"

# Run the server
pnpm dev
```

## How It Works

1. **Tool Discovery**: The MCP server connects to your Authlane instance and fetches all available tools for the specified user
2. **Dynamic Loading**: Tools are dynamically loaded from all services the user has connected (GitHub, Slack, Linear, etc.)
3. **MCP Protocol**: Tools are exposed via the Model Context Protocol, making them available to AI frameworks
4. **Tool Execution**: When a tool is called, the server routes the request to the appropriate service integration

## Available Tools

The tools available depend on which services the user has connected through Authlane. For example:

- **GitHub**: `github_create_issue`, `github_list_issues`, `github_create_pull_request`
- **Slack**: `slack_send_message`, `slack_list_channels`, `slack_create_channel`
- **Linear**: `linear_create_issue`, `linear_list_issues`, `linear_update_issue`
- **Gmail**: `gmail_send_email`, `gmail_read_emails`, `gmail_search_emails`
- And more...

## Architecture

```
┌─────────────────┐
│  Claude Desktop │
│   (MCP Client)  │
└────────┬────────┘
         │ MCP Protocol
         │ (stdio)
┌────────▼────────┐
│ @authlane/mcp   │
│     server      │
└────────┬────────┘
         │ HTTPS
         │ REST API
┌────────▼────────┐
│  Authlane API   │
│  (tools endpoint)│
└────────┬────────┘
         │
    ┌────▼────┐
    │ GitHub  │
    │ Slack   │
    │ Linear  │
    │  etc.   │
    └─────────┘
```

## Development

### Build

```bash
pnpm build
```

### Watch Mode

```bash
pnpm dev
```

### Type Checking

```bash
pnpm type-check
```

## Troubleshooting

### "Configuration error: AUTHLANE_API_KEY is required"

Make sure you've set the `AUTHLANE_API_KEY` environment variable in your Claude Desktop config.

### "Configuration error: AUTHLANE_USER_ID is required"

Make sure you've set the `AUTHLANE_USER_ID` environment variable in your Claude Desktop config.

### No tools appear in Claude Desktop

1. Verify the user has connected services in Authlane
2. Check the Claude Desktop logs for errors
3. Ensure the API key has the correct permissions
4. Verify the base URL is correct (if self-hosting)

### Server fails to start

1. Check that all dependencies are installed: `pnpm install`
2. Verify the build succeeded: `pnpm build`
3. Check environment variables are set correctly

## Related Packages

- [@authlane/sdk](../sdk) - TypeScript SDK for Authlane
- [@authlane/react](../react) - React components for Authlane
- [Authlane API](../../apps/api) - Core API server

## Resources

- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Claude Desktop Documentation](https://claude.ai/desktop)
- [Authlane Documentation](https://authlane.com/docs)

## License

MIT
