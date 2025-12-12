# Use Case: AI Agents

Build AI assistants that can interact with external services on behalf of users.

## Overview

AI agents need access to user services (GitHub, Slack, Calendar, etc.) to perform actions. Authlane provides:

1. **Secure credential storage** - OAuth tokens encrypted at rest
2. **Tool definitions** - Ready-to-use MCP and OpenAI function formats
3. **Per-user access** - Each user connects their own accounts

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       Your AI Application                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐   │
│  │   Chat UI   │───▶│  AI Agent   │───▶│  Tool Executor  │   │
│  └─────────────┘    └─────────────┘    └────────┬────────┘   │
└──────────────────────────────────────────────────┼────────────┘
                                                   │
                           ┌───────────────────────┴───────────────────────┐
                           │                                               │
                           ▼                                               │
                    ┌─────────────┐                                        │
                    │  Authlane   │                                        │
                    │   - Auth    │                                        │
                    │   - Tools   │                                        │
                    │   - Creds   │                                        │
                    └──────┬──────┘                                        │
                           │                                               │
         ┌─────────────────┼─────────────────┐                             │
         │                 │                 │                             │
         ▼                 ▼                 ▼                             │
  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                      │
  │   GitHub    │   │    Slack    │   │  Calendar   │◀─────────────────────┘
  └─────────────┘   └─────────────┘   └─────────────┘    Direct API calls
```

## Implementation Steps

### 1. User Connects Services

Users connect their accounts through your UI:

```tsx
function ConnectionsPage() {
  const [services, setServices] = useState([]);

  useEffect(() => {
    loadServices();
  }, []);

  async function connect(serviceId: string) {
    const response = await fetch(`/api/connect/${serviceId}`);
    const { authUrl } = await response.json();
    window.location.href = authUrl;
  }

  return (
    <div>
      <h2>Connect Your Services</h2>
      {services.map(service => (
        <button key={service.id} onClick={() => connect(service.id)}>
          Connect {service.name}
        </button>
      ))}
    </div>
  );
}
```

### 2. Get Available Tools

Fetch tools based on user's connections:

```typescript
async function getToolsForUser(userId: string) {
  // Get user's connections
  const { data: connections } = await authlane.connections.list({
    userId,
    status: 'connected',
  });

  // Filter tools by connected services
  const connectedServices = connections.items.map(c => c.serviceId);

  const { data: tools } = await authlane.tools.list({
    userId,
    format: 'openai',
    services: connectedServices,
  });

  return tools;
}
```

### 3. AI Agent with Tools

```typescript
import OpenAI from 'openai';
import { Authlane } from '@authlane/sdk';

const openai = new OpenAI();
const authlane = new Authlane({ apiKey: process.env.AUTHLANE_API_KEY });

async function runAgent(userId: string, message: string) {
  const tools = await getToolsForUser(userId);

  const messages = [
    {
      role: 'system',
      content: `You are a helpful assistant that can perform actions on the user's connected services.

Available services: ${[...new Set(tools.tools.map(t => t.function.name.split('_')[0]))].join(', ')}

Guidelines:
- Only use tools for services the user has connected
- Ask for confirmation before making changes
- Provide helpful summaries of actions taken`,
    },
    { role: 'user', content: message },
  ];

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages,
    tools: tools.tools,
  });

  // Handle tool calls
  if (response.choices[0].message.tool_calls) {
    return await handleToolCalls(userId, messages, response);
  }

  return response.choices[0].message.content;
}

async function handleToolCalls(userId, messages, response) {
  const toolCalls = response.choices[0].message.tool_calls;
  messages.push(response.choices[0].message);

  for (const toolCall of toolCalls) {
    try {
      const { data } = await authlane.tools.execute({
        userId,
        tool: toolCall.function.name,
        parameters: JSON.parse(toolCall.function.arguments),
      });

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(data.result),
      });
    } catch (error) {
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify({ error: error.message }),
      });
    }
  }

  // Continue conversation
  const nextResponse = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages,
    tools: tools.tools,
  });

  return nextResponse.choices[0].message.content;
}
```

### 4. Handle Missing Connections

When a user asks for something they haven't connected:

```typescript
async function handleToolExecution(userId: string, tool: string, params: any) {
  const { data, error } = await authlane.tools.execute({
    userId,
    tool,
    parameters: params,
  });

  if (error?.code === 'CONNECTION_REQUIRED') {
    const serviceId = error.details.serviceId;
    const { data: authData } = await authlane.oauth.authorize({
      userId,
      serviceId,
    });

    return {
      type: 'connection_needed',
      message: `To do this, I need access to your ${serviceId} account.`,
      authUrl: authData.authorizationUrl,
    };
  }

  return { type: 'success', result: data.result };
}
```

## Example Agents

### Personal Productivity Agent

```typescript
const systemPrompt = `You are a personal productivity assistant.

You can help with:
- Creating and managing GitHub issues
- Scheduling calendar events
- Sending Slack messages
- Searching Notion

Always:
- Ask before creating/modifying things
- Summarize what you did
- Suggest next steps`;

// User: "Create an issue for the login bug and schedule a meeting tomorrow to discuss it"
// Agent: Creates GitHub issue, schedules calendar event, shares details
```

### DevOps Agent

```typescript
const systemPrompt = `You are a DevOps assistant.

You can help with:
- Monitoring Sentry errors
- Creating Jira tickets
- Alerting team in Slack
- Checking GitHub PRs

Workflow:
1. Analyze errors/issues
2. Create tracking tickets
3. Notify relevant team members`;
```

### Sales Agent

```typescript
const systemPrompt = `You are a sales assistant.

You can help with:
- Managing HubSpot contacts
- Tracking Pipedrive deals
- Scheduling follow-up calls
- Sending email reminders

Focus on:
- Lead qualification
- Deal progression
- Follow-up timing`;
```

## Best Practices

### 1. Minimal Permissions

Only request scopes you need:

```typescript
const { data } = await authlane.oauth.authorize({
  userId,
  serviceId: 'github',
  scopes: ['repo:status', 'public_repo'], // Not full 'repo' access
});
```

### 2. Confirmation for Mutations

```typescript
const systemPrompt = `...
Before creating, updating, or deleting anything:
1. Describe what you're about to do
2. Ask "Should I proceed?"
3. Only act on confirmation
...`;
```

### 3. Error Handling

```typescript
async function safeToolExecution(userId, tool, params) {
  try {
    const result = await authlane.tools.execute({ userId, tool, parameters: params });
    return { success: true, data: result.data };
  } catch (error) {
    if (error.code === 'CONNECTION_EXPIRED') {
      return { success: false, action: 'reconnect', service: tool.split('_')[0] };
    }
    if (error.code === 'RATE_LIMITED') {
      return { success: false, action: 'retry', delay: error.retryAfter };
    }
    return { success: false, error: error.message };
  }
}
```

### 4. Audit Logging

```typescript
async function executeWithAudit(userId, tool, params) {
  const start = Date.now();

  try {
    const result = await authlane.tools.execute({ userId, tool, parameters: params });

    await logAudit({
      userId,
      tool,
      params,
      result: 'success',
      duration: Date.now() - start,
    });

    return result;
  } catch (error) {
    await logAudit({
      userId,
      tool,
      params,
      result: 'error',
      error: error.message,
      duration: Date.now() - start,
    });
    throw error;
  }
}
```

## Security Considerations

1. **Validate User ID** - Ensure the userId comes from your authenticated session
2. **Scope Limitations** - Request only necessary OAuth scopes
3. **Action Confirmation** - Require confirmation for destructive actions
4. **Rate Limiting** - Implement per-user rate limits
5. **Audit Trail** - Log all tool executions

## Next Steps

- [MCP Server Setup](../../05-sdk/mcp-server/installation.md)
- [Tool Definitions](../../06-integrations/tool-definitions.md)
- [Security Best Practices](../../04-security/index.md)

