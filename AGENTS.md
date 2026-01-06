# AGENTS.md - AI Assistant Context Guide

This document provides essential context for AI assistants working on the Authlane codebase.

## Project Overview

**Authlane** is an open-source platform for managing third-party integrations in AI agents and SaaS applications. It enables SaaS providers to offer their end-users the ability to connect external services (GitHub, Slack, Google, CRM systems, etc.) via OAuth2, API keys, or other credentials without building complex integration infrastructure.

**Key Principle:** Authlane is NOT a middleware - it serves as a central credentials and tool configuration manager. AI agents then call external services directly using information from the Authlane API.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SaaS Application                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐ │
│  │   AI Agent  │    │  Frontend   │    │   Backend API   │ │
│  └──────┬──────┘    └──────┬──────┘    └────────┬────────┘ │
│         │                  │                     │           │
└─────────┼──────────────────┼─────────────────────┼───────────┘
          │                  │                     │
          │ 3. Call external │ 1. Show connection │ 2. Get credentials
          │    APIs directly │    UI (iframe/SDK)  │    & tool configs
          ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                        Authlane                               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐ │
│  │ Credentials │    │ Connection  │    │ Tool Definitions│ │
│  │   Vault     │    │     UI      │    │ (MCP, OpenAI)   │ │
│  └─────────────┘    └─────────────┘    └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Component | Technology | Notes |
|-----------|------------|-------|
| **Runtime** | Node.js 22+ | LTS, native TypeScript support |
| **Framework** | Hono | High performance, TypeScript-native, edge-ready |
| **Database** | PostgreSQL 16+ | RLS for multi-tenancy, JSONB for flexibility |
| **ORM** | Drizzle | Type-safe, lightweight, great migrations |
| **Cache** | Redis | Session storage, rate limiting |
| **Queue** | BullMQ | Reliable job processing (token refresh) |
| **Encryption** | Node.js crypto / Vault | AES-256-GCM for credentials |
| **Monorepo** | Turborepo + pnpm | Fast builds, efficient dependencies |
| **Testing** | Vitest | Fast, TypeScript-native |
| **Docs** | Mintlify | Modern, MDX, great DX |
| **Dashboard** | React + Tailwind + shadcn/ui | Modern, accessible |
| **Connection Widget** | React (embeddable) | Iframe or SDK component |

## Monorepo Structure

```
authlane/
├── apps/
│   ├── api/                    # Main API server (Hono)
│   ├── dashboard/              # Admin dashboard (React)
│   ├── widget/                 # Embeddable connection widget
│   └── docs/                   # Documentation (Mintlify)
├── packages/
│   ├── sdk/                    # @authlane/sdk - TypeScript SDK
│   ├── react/                  # @authlane/react - React components
│   ├── database/               # Drizzle schema + migrations
│   ├── shared/                 # Shared types and utilities
│   ├── mcp-server/             # MCP server implementation
│   └── crypto/                 # Encryption utilities
├── integrations/               # Individual service integrations
│   ├── github/
│   │   ├── config.yaml         # OAuth config, scopes
│   │   ├── tools.ts            # Tool definitions
│   │   └── index.ts            # Integration entry point
│   ├── slack/
│   ├── google/
│   └── ...
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml      # Self-hosting
├── .env.example
├── turbo.json
└── package.json
```

## Core Concepts

### Multi-Tenancy

- **Tenants**: SaaS providers using Authlane
- **End-users**: End-users of the tenant's SaaS application
- **Connections**: Links between end-users and third-party services
- **Row-Level Security (RLS)**: PostgreSQL feature used for tenant isolation

### Authentication & Authorization

- **OAuth 2.1**: Mandatory PKCE for all flows
- **API Keys**: For tenant authentication
- **State parameter**: Cryptographically random tokens
- **Token refresh**: Automatic with exponential backoff

### Security

- **Encryption**: AES-256-GCM for credentials at rest
- **TLS 1.3**: For data in transit
- **Key management**: HashiCorp Vault or AWS KMS (cloud), environment variables (self-hosted)
- **Audit logging**: All credential access is logged

## Database Schema (Key Tables)

### Tenants
- SaaS providers using Authlane
- Fields: `id`, `name`, `api_key_hash`, `settings`, `created_at`

### Services
- Available services for connection (GitHub, Slack, etc.)
- Fields: `id`, `name`, `auth_type`, `config`, `enabled`

### Tenant Services
- Tenant-specific service configurations
- Fields: `tenant_id`, `service_id`, `enabled`, `oauth_client_id`, `oauth_client_secret_enc`, `custom_scopes`

### Connections
- End-user connections to services
- Fields: `id`, `tenant_id`, `external_user_id`, `service_id`, `status`, `credentials_enc`, `metadata`, `connected_at`, `expires_at`

**Important**: All tables use Row-Level Security (RLS) for tenant isolation.

## API Patterns

### Error Handling (Supabase-style)

```typescript
// Never throws exceptions
const { data, error } = await authlane.connections.list({ userId: 'user_123' });

if (error) {
  console.error(error.message);  // Human-readable message
  console.error(error.code);     // Machine-readable code
  console.error(error.hint);     // How to fix it
  console.error(error.docUrl);   // Link to docs
}
```

### Key API Endpoints

- `GET /api/v1/users/{user_id}/connections` - List all connections for a user
- `GET /api/v1/services` - List available services
- `GET /api/v1/users/{user_id}/connections/{service}/credentials` - Get credentials
- `GET /api/v1/users/{user_id}/tools?format=mcp` - Get tool definitions (MCP or OpenAI format)
- `GET /api/v1/users/{user_id}/connections/{service}/health` - Check connection health

## Integration Structure

Each integration follows this structure:

```
integrations/{service}/
├── config.yaml         # OAuth config, scopes, endpoints
├── tools.ts            # Tool definitions (MCP/OpenAI format)
└── index.ts            # Integration entry point
```

### Tool Definitions

Tools must support both MCP and OpenAI function calling formats:

**MCP Format:**
```json
{
  "tools": [{
    "name": "github_create_issue",
    "description": "Creates a new issue",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": { "type": "string" },
        "repo": { "type": "string" },
        "title": { "type": "string" }
      },
      "required": ["owner", "repo", "title"]
    }
  }]
}
```

**OpenAI Format:**
```json
{
  "functions": [{
    "name": "github_create_issue",
    "description": "Creates a new issue",
    "parameters": {
      "type": "object",
      "properties": {
        "owner": { "type": "string" },
        "repo": { "type": "string" },
        "title": { "type": "string" }
      },
      "required": ["owner", "repo", "title"]
    }
  }]
}
```

## Development Guidelines

### Code Style

- **Language**: TypeScript (strict mode)
- **Comments**: Always in English
- **Naming**: Use descriptive, domain-driven names
- **Principles**: Follow DRY, YAGNI, KISS, SOLID, DDD

### Testing

- Write tests before implementation when specified
- Use Vitest for all tests
- Test coverage should be comprehensive for core functionality

### Error Handling

- Use Supabase-style error handling (never throw exceptions from SDK)
- Always return `{ data, error }` tuples
- Provide helpful error messages with hints and documentation links

### Security

- Never log credentials in plain text
- Always use encryption for sensitive data
- Validate all inputs
- Use parameterized queries (Drizzle handles this)
- Implement rate limiting on all public endpoints

### Multi-Tenancy

- Always set tenant context per request
- Use RLS policies for database access
- Never expose data from one tenant to another
- Validate `tenant_id` on all operations

## Common Patterns

### SDK Method Pattern

```typescript
async method(params: Params): Promise<Result<Data, Error>> {
  try {
    const response = await this.client.request(...);
    return { data: response, error: null };
  } catch (error) {
    return { 
      data: null, 
      error: {
        message: error.message,
        code: 'ERROR_CODE',
        hint: 'How to fix it',
        docUrl: 'https://docs.authlane.dev/...'
      }
    };
  }
}
```

### OAuth Flow Pattern

1. Generate PKCE code verifier and challenge
2. Generate state parameter (cryptographically random)
3. Redirect user to OAuth provider
4. Handle callback with state validation
5. Exchange code for tokens
6. Store encrypted credentials
7. Set up automatic token refresh job

### Token Refresh Pattern

- Use BullMQ for scheduled jobs
- Exponential backoff on failures
- Update `expires_at` in database
- Log refresh attempts for debugging

## Important Conventions

1. **User IDs**: Always use `external_user_id` (from tenant's system), not internal Authlane user IDs
2. **Service IDs**: Use lowercase, hyphenated names (e.g., `github`, `google-calendar`)
3. **Status Values**: `pending`, `connected`, `expired`, `error`
4. **Date Formats**: Always use ISO 8601 (UTC)
5. **API Versioning**: Use `/api/v1/` prefix for all endpoints

## MVP Integrations (15 services)

**Developer Tools (4):** GitHub, Linear, Jira, Sentry
**Communication (3):** Slack, Discord, Gmail
**Productivity (3):** Notion, Google Drive, Google Calendar
**CRM (3):** HubSpot, Salesforce, Pipedrive
**Other (2):** Stripe, Airtable

## License

- **Core**: Elastic License 2.0 (ELv2)
- **Self-hosting**: Free for internal use
- **Commercial use**: Allowed in own products
- **Restriction**: Cannot offer as managed service (competes with cloud version)

## Resources

- **Specification**: See `authlane-specification.md` for complete technical and business requirements
- **Documentation**: Will be in `apps/docs/` (Mintlify)
- **API Reference**: OpenAPI spec will be generated

## When Implementing Features

1. **Read the specification** (`authlane-specification.md`) for detailed requirements
2. **Follow the monorepo structure** - place code in appropriate packages/apps
3. **Maintain type safety** - use TypeScript strictly, leverage Drizzle types
4. **Consider multi-tenancy** - always validate tenant context
5. **Security first** - encrypt sensitive data, validate inputs, use RLS
6. **Test thoroughly** - especially OAuth flows and token refresh
7. **Document changes** - update relevant docs and add code comments in English

## Questions to Ask

If you're unsure about:
- **Architecture decisions**: Check the specification document
- **Database schema**: See the schema section in specification
- **API design**: Follow Supabase/Stripe patterns
- **Integration structure**: Follow the pattern in `integrations/` directory
- **Security concerns**: Always err on the side of caution, encrypt everything sensitive

---

*This document is maintained to help AI assistants understand the Authlane codebase. Update it as the project evolves.*














