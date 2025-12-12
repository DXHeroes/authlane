# Using Authlane with AI Agents

Build AI assistants that can interact with user-connected services.

## Overview

Authlane provides two key features for AI agents:

1. **Credential Management** - Securely store and retrieve OAuth tokens
2. **Tool Definitions** - MCP and OpenAI function calling formats

## MCP Server Integration

### Install MCP Server

```bash
npm install @authlane/mcp-server
```

### Configure Claude Desktop

Add to your Claude Desktop config (`~/.claude/config.json`):

```json
{
  "mcpServers": {
    "authlane": {
      "command": "npx",
      "args": ["@authlane/mcp-server"],
      "env": {
        "AUTHLANE_API_KEY": "your-api-key",
        "AUTHLANE_USER_ID": "user-123"
      }
    }
  }
}
```

### Available Tools

Once configured, Claude can use tools like:

```
- github_create_issue: Create a GitHub issue
- github_list_repos: List user's repositories
- slack_send_message: Send a Slack message
- google_calendar_create_event: Create a calendar event
- notion_search: Search Notion pages
```

## OpenAI Function Calling

### Get Tool Definitions

```typescript
import { Authlane } from '@authlane/sdk';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY,
});

// Get tools in OpenAI format
const { data } = await authlane.tools.list({
  userId: 'user_123',
  format: 'openai',
});

// Use with OpenAI
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Create a GitHub issue about the login bug' }],
  tools: data.tools,
});
```

### Execute Tool Calls

```typescript
// When OpenAI returns a tool call
if (response.choices[0].message.tool_calls) {
  for (const toolCall of response.choices[0].message.tool_calls) {
    const { data: result } = await authlane.tools.execute({
      userId: 'user_123',
      tool: toolCall.function.name,
      parameters: JSON.parse(toolCall.function.arguments),
    });

    // Include result in next message
    messages.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify(result),
    });
  }
}
```

## LangChain Integration

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { Authlane } from '@authlane/sdk';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY,
});

// Create LangChain tools from Authlane
async function createAuthlaneTools(userId: string) {
  const { data } = await authlane.tools.list({ userId, format: 'openai' });

  return data.tools.map(tool => new DynamicStructuredTool({
    name: tool.function.name,
    description: tool.function.description,
    schema: tool.function.parameters,
    func: async (params) => {
      const { data: result } = await authlane.tools.execute({
        userId,
        tool: tool.function.name,
        parameters: params,
      });
      return JSON.stringify(result);
    },
  }));
}

// Use in agent
const tools = await createAuthlaneTools('user_123');
const model = new ChatOpenAI({ modelName: 'gpt-4' });
const agent = createReactAgent({ llm: model, tools });
```

## Vercel AI SDK

```typescript
import { openai } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { Authlane } from '@authlane/sdk';
import { z } from 'zod';

const authlane = new Authlane({
  apiKey: process.env.AUTHLANE_API_KEY,
});

const result = await generateText({
  model: openai('gpt-4-turbo'),
  prompt: 'Create a GitHub issue about the bug we discussed',
  tools: {
    createGitHubIssue: tool({
      description: 'Create a new issue on GitHub',
      parameters: z.object({
        owner: z.string(),
        repo: z.string(),
        title: z.string(),
        body: z.string(),
      }),
      execute: async ({ owner, repo, title, body }) => {
        const { data } = await authlane.tools.execute({
          userId: 'user_123',
          tool: 'github_create_issue',
          parameters: { owner, repo, title, body },
        });
        return data.result;
      },
    }),
  },
});
```

## Building a Complete AI Assistant

### Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    User     │────▶│  Your App   │────▶│  AI Model   │
└─────────────┘     └──────┬──────┘     └──────┬──────┘
                          │                    │
                          │                    │ Tool Calls
                          │                    ▼
                          │            ┌─────────────┐
                          └───────────▶│  Authlane   │
                                       └──────┬──────┘
                                              │
                    ┌────────────────────────┴────────────────────────┐
                    │                        │                        │
                    ▼                        ▼                        ▼
             ┌─────────────┐          ┌─────────────┐          ┌─────────────┐
             │   GitHub    │          │    Slack    │          │   Google    │
             └─────────────┘          └─────────────┘          └─────────────┘
```

### Example: Personal Assistant

```typescript
import { Authlane } from '@authlane/sdk';
import OpenAI from 'openai';

const authlane = new Authlane({ apiKey: process.env.AUTHLANE_API_KEY });
const openai = new OpenAI();

async function runAssistant(userId: string, userMessage: string) {
  // Get user's available tools
  const { data: toolsData } = await authlane.tools.list({
    userId,
    format: 'openai',
  });

  const messages = [
    {
      role: 'system',
      content: `You are a helpful assistant with access to the user's connected services.
Available tools: ${toolsData.tools.map(t => t.function.name).join(', ')}`,
    },
    { role: 'user', content: userMessage },
  ];

  // Get AI response
  let response = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages,
    tools: toolsData.tools,
  });

  // Handle tool calls
  while (response.choices[0].message.tool_calls) {
    const toolCalls = response.choices[0].message.tool_calls;

    messages.push(response.choices[0].message);

    for (const toolCall of toolCalls) {
      const { data: result } = await authlane.tools.execute({
        userId,
        tool: toolCall.function.name,
        parameters: JSON.parse(toolCall.function.arguments),
      });

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }

    // Get next response
    response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages,
      tools: toolsData.tools,
    });
  }

  return response.choices[0].message.content;
}

// Usage
const result = await runAssistant(
  'user_123',
  'Schedule a meeting for tomorrow at 2pm and create a GitHub issue to discuss the agenda'
);
```

## Handling Missing Connections

When a tool requires a service that isn't connected:

```typescript
const { data, error } = await authlane.tools.execute({
  userId: 'user_123',
  tool: 'github_create_issue',
  parameters: { /* ... */ },
});

if (error?.code === 'CONNECTION_REQUIRED') {
  // Prompt user to connect the service
  const { data: authData } = await authlane.oauth.authorize({
    userId: 'user_123',
    serviceId: 'github',
  });

  return {
    type: 'connection_required',
    service: 'github',
    authUrl: authData.authorizationUrl,
    message: 'Please connect your GitHub account to use this feature.',
  };
}
```

## Best Practices

### 1. Filter Available Tools

Only provide tools for services the user has connected:

```typescript
const { data: connections } = await authlane.connections.list({
  userId,
  status: 'connected',
});

const connectedServices = new Set(connections.items.map(c => c.serviceId));

const { data: tools } = await authlane.tools.list({
  userId,
  format: 'openai',
  services: Array.from(connectedServices),
});
```

### 2. Handle Errors Gracefully

```typescript
try {
  const { data, error } = await authlane.tools.execute({
    userId,
    tool: 'github_create_issue',
    parameters: params,
  });

  if (error) {
    return `I couldn't create the issue: ${error.message}`;
  }

  return `Created issue: ${data.result.html_url}`;
} catch (err) {
  return `Something went wrong. Please try again later.`;
}
```

### 3. Respect Rate Limits

Authlane handles rate limits internally, but you should still:
- Cache tool definitions (they don't change often)
- Batch operations when possible
- Use appropriate timeouts

## Next Steps

- [MCP Server Documentation](../../05-sdk/mcp-server/installation.md)
- [TypeScript SDK Reference](../../05-sdk/typescript/api-reference.md)
- [Tool Definitions](../../06-integrations/tool-definitions.md)

