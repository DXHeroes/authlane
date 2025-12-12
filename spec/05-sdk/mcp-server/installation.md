# MCP Server Installation

Install and configure the Authlane MCP Server for AI agent integration.

## Overview

The Authlane MCP Server implements the Model Context Protocol (MCP), enabling AI assistants like Claude to interact with third-party services through Authlane.

## Installation

### Global Installation (Recommended)

```bash
# npm
npm install -g @authlane/mcp-server

# Using npx (no install)
npx @authlane/mcp-server
```

### Local Installation

```bash
npm install @authlane/mcp-server
```

## Claude Desktop Integration

### Configuration File Location

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

### Configuration

```json
{
  "mcpServers": {
    "authlane": {
      "command": "authlane-mcp",
      "env": {
        "AUTHLANE_API_KEY": "ak_prod_xxxxxxxxxxxxxxxxxxxx",
        "AUTHLANE_USER_ID": "user_123"
      }
    }
  }
}
```

### Using npx

```json
{
  "mcpServers": {
    "authlane": {
      "command": "npx",
      "args": ["@authlane/mcp-server"],
      "env": {
        "AUTHLANE_API_KEY": "ak_prod_xxxxxxxxxxxxxxxxxxxx",
        "AUTHLANE_USER_ID": "user_123"
      }
    }
  }
}
```

### With Custom API URL

```json
{
  "mcpServers": {
    "authlane": {
      "command": "authlane-mcp",
      "env": {
        "AUTHLANE_API_KEY": "ak_prod_xxxxxxxxxxxxxxxxxxxx",
        "AUTHLANE_USER_ID": "user_123",
        "AUTHLANE_API_URL": "https://your-authlane-instance.com"
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTHLANE_API_KEY` | Yes | Your Authlane API key |
| `AUTHLANE_USER_ID` | Yes | User ID for tool execution |
| `AUTHLANE_API_URL` | No | API URL (default: https://api.authlane.com) |
| `AUTHLANE_SERVICES` | No | Comma-separated list of enabled services |
| `AUTHLANE_DEBUG` | No | Enable debug logging |

## Verifying Installation

After configuring Claude Desktop, restart the application and ask Claude:

```
What Authlane tools do you have access to?
```

Claude should respond with a list of available tools based on the user's connected services.

## Running Standalone

For testing or debugging:

```bash
# Set environment variables
export AUTHLANE_API_KEY="ak_prod_xxx"
export AUTHLANE_USER_ID="user_123"

# Run the server
authlane-mcp

# With debug output
AUTHLANE_DEBUG=true authlane-mcp
```

## Programmatic Usage

```typescript
import { AuthlaneMcpServer } from '@authlane/mcp-server';

const server = new AuthlaneMcpServer({
  apiKey: process.env.AUTHLANE_API_KEY!,
  userId: process.env.AUTHLANE_USER_ID!,
  apiUrl: process.env.AUTHLANE_API_URL,
});

// Start the server
await server.start();
```

## Docker

```dockerfile
FROM node:20-slim

RUN npm install -g @authlane/mcp-server

ENV AUTHLANE_API_KEY=""
ENV AUTHLANE_USER_ID=""

CMD ["authlane-mcp"]
```

```bash
docker run -e AUTHLANE_API_KEY=ak_xxx -e AUTHLANE_USER_ID=user_123 authlane-mcp
```

## Troubleshooting

### Server Not Starting

```bash
# Check if command is available
which authlane-mcp

# If not found, reinstall
npm install -g @authlane/mcp-server
```

### No Tools Available

1. Check API key is valid
2. Verify user has connected services
3. Enable debug logging:

```json
{
  "mcpServers": {
    "authlane": {
      "command": "authlane-mcp",
      "env": {
        "AUTHLANE_API_KEY": "ak_xxx",
        "AUTHLANE_USER_ID": "user_123",
        "AUTHLANE_DEBUG": "true"
      }
    }
  }
}
```

### Permission Errors

```bash
# Fix npm permissions
sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}

# Or use npx instead
npx @authlane/mcp-server
```

## Next Steps

- [Configuration](./configuration.md)
- [Available Tools](./tools.md)
- [Claude Desktop Integration](./claude-desktop.md)

