# AGENTS.md - AI Assistant Context Guide

This document provides essential context for AI assistants working on the Authlane codebase.

## Project Overview

**Authlane** is an open-source platform for managing third-party integrations in AI agents and SaaS applications. It enables SaaS providers to offer their end-users the ability to connect external services (GitHub, Slack, Google, CRM systems, etc.) via OAuth2, API keys, or other credentials without building complex integration infrastructure.

**Key Principle:** Authlane is a control plane, not middleware or a gateway. It serves the dashboard, hosted connect UI, credential access, connection state, and tool definitions from one production Hono runtime. SaaS backends and AI agents call providers directly; provider traffic must never pass through Authlane.

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
| **Cache** | Redis | Hot reads, API principals, tenant policy, rate limiting |
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
│   ├── email/                  # Transactional email support
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
│   └── docker-compose.yml      # Development infrastructure
├── docker-compose.yml          # One-runtime self-hosting stack
├── .env.example
├── turbo.json
└── package.json
```

## Core Concepts

### Multi-Tenancy

- **Organizations**: SaaS providers using Authlane
- **End-users**: Addressed only by the organization's `external_user_id`
- **Connections**: Links between end-users and third-party services
- **Row-Level Security (RLS)**: PostgreSQL feature used for tenant isolation

### Authentication & Authorization

- **OAuth 2.1**: Mandatory PKCE for all flows
- **API Keys**: For tenant authentication
- **State parameter**: Cryptographically random tokens
- **Token refresh**: Automatic with exponential backoff

### Security

- **Encryption**: Per-record AES-256-GCM DEKs wrapped by a versioned deployment KEK
- **TLS 1.3**: For data in transit
- **Key management**: Versioned keyrings held outside PostgreSQL (KMS/Vault in production)
- **Audit logging**: All credential access is logged

## Database Schema (Key Tables)

### Organizations and API Keys
- Organizations are the tenant boundary; API keys belong to exactly one organization
- API keys store a versioned keyed-HMAC lookup digest, scopes, enabled state, and optional expiry

### Services
- Available services for connection (GitHub, Slack, etc.)
- Fields: `id`, `name`, `auth_type`, `config`, `enabled`

### Organization Services
- Organization-specific service configurations
- OAuth client secrets are referenced through tenant-bound `secret_records`, never stored in plaintext configuration

### Connections
- End-user connections to services
- Credentials are referenced through immutable tenant-bound `secret_records`; refresh and ID tokens never leave the control plane

### Connect Sessions and Outbox
- Connect sessions store only a token hash and bind one external user, exact origin, service allowlist, and expiry
- Outbox events provide retryable, signed, idempotent lifecycle webhooks

**Important**: All tables use Row-Level Security (RLS) for tenant isolation.

## API Patterns

### Error Handling (Supabase-style)

```typescript
// Never throws exceptions
const { data, error } = await authlane.connections.list({ externalUserId: 'user_123' });

if (error) {
  console.error(error.message);  // Human-readable message
  console.error(error.code);     // Machine-readable code
  console.error(error.hint);     // How to fix it
  console.error(error.docUrl);   // Link to docs
}
```

### Key API Endpoints

- `GET /api/v1/catalog/services` - List organization-enabled services
- `GET /api/v1/users/{external_user_id}/connections` - List effective connection states
- `GET /api/v1/users/{external_user_id}/capabilities` - Get states and tool definitions in one hot read
- `POST /api/v1/users/{external_user_id}/connections/{service}/credential-leases` - Issue audited, access-only material to scoped server principals
- `GET /api/v1/users/{external_user_id}/tools?format=mcp` - Get definitions only
- `POST /api/v1/connect-sessions` - Create a short-lived hosted connect session

There is no tool-execution endpoint and no Authlane MCP server.

## Integration Structure

Each integration follows this structure:

```
integrations/{service}/
├── config.yaml         # OAuth config, scopes, endpoints
├── tools.ts            # Tool definitions and local provider handlers
└── index.ts            # Direct-execution adapter for the SaaS runtime
```

### Tool Definitions

Authlane converts canonical definitions to MCP and OpenAI function calling formats. The integration adapter executes handlers only inside the SaaS runtime:

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
- Resolve `organization_id` from the authenticated principal on all operations

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
3. **Status Values**: stored values are `pending`, `connected`, `expired`, `error`; reads may compute `disconnected`
4. **Date Formats**: Always use ISO 8601 (UTC)
5. **API Versioning**: Use `/api/v1/` prefix for all endpoints

## Integrations (18 services)

Source of truth: `packages/shared/src/supported-services.ts`.

**Developer Tools (3):** GitHub, Linear, Jira
**Communication (3):** Slack, Discord, Gmail
**Productivity (6):** Notion, Google Drive, Google Calendar, Microsoft Mail, Microsoft Calendar, Microsoft SharePoint
**CRM (4):** HubSpot, Salesforce, Pipedrive, Attio
**Other (2):** Stripe, Airtable

## License

- **Repository**: MIT License
- **Copyright**: 2026 Authlane contributors
- **Use**: Permissive use, modification, distribution, sublicensing, and sale are allowed

## Resources

- **Product rationale**: `apps/docs/concepts/how-authlane-works.mdx` and `apps/docs/concepts/core-concepts.mdx`
- **Documentation**: `apps/docs/` (Mintlify)
- **API Reference**: `apps/docs/api-reference/openapi.yaml`

## When Implementing Features

1. **Read the docs sources** in `apps/docs/` (start with `concepts/how-authlane-works.mdx`) for behavior and boundaries
2. **Follow the monorepo structure** - place code in appropriate packages/apps
3. **Maintain type safety** - use TypeScript strictly, leverage Drizzle types
4. **Consider multi-tenancy** - always validate tenant context
5. **Security first** - encrypt sensitive data, validate inputs, use RLS
6. **Test thoroughly** - especially OAuth flows and token refresh
7. **Document changes** - update relevant docs and add code comments in English

## Questions to Ask

If you're unsure about:
- **Architecture decisions**: Check `apps/docs/concepts/` and this file
- **Database schema**: See `packages/database/src/schema/` (source of truth)
- **API design**: Follow Supabase/Stripe patterns
- **Integration structure**: Follow the pattern in `integrations/` directory
- **Security concerns**: Always err on the side of caution, encrypt everything sensitive

---

*This document is maintained to help AI assistants understand the Authlane codebase. Update it as the project evolves.*









