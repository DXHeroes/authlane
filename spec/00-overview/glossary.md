# Glossary

Key terms and definitions used throughout the Authlane documentation.

## Core Concepts

### Organization
A tenant in Authlane representing a company or team using the platform. Organizations have their own:
- Members (users with roles)
- API keys
- Service configurations
- Connections

Previously called "Tenant" in some documentation.

### User
An authenticated user in the Authlane system. Users belong to one or more Organizations and have roles within each.

### External User ID
The identifier for an end-user in **your** SaaS application. When your users connect services through Authlane, they're identified by this ID. This is NOT the Authlane user ID.

Example: If your SaaS app has a user "john@example.com" with ID "usr_123", that's the External User ID.

### Connection
A link between an External User and a third-party Service. Contains:
- Encrypted credentials (OAuth tokens or API keys)
- Connection status
- Metadata (scopes, expiration, etc.)

### Service
An external third-party application that can be connected via Authlane. Examples: GitHub, Slack, Google Calendar.

### Organization Service
Configuration of a Service for a specific Organization. Allows organizations to:
- Enable/disable services
- Use custom OAuth credentials
- Define custom scopes

## Authentication & Authorization

### API Key
Authentication credential for programmatic API access. Format: `ak_<32 hex chars>`.
- Scoped to an Organization
- Can have expiration dates
- Stored as SHA-256 hash (not plaintext)

### Session
Browser-based authentication using cookies. Sessions are managed by Better Auth and expire after 7 days.

### OAuth 2.0
Industry-standard protocol for authorization. Authlane uses OAuth 2.0 to connect users to third-party services.

### PKCE (Proof Key for Code Exchange)
OAuth 2.0 extension that prevents authorization code interception attacks. Authlane mandates PKCE for all OAuth flows.

### State Parameter
Cryptographically random token used in OAuth flows to prevent CSRF attacks.

### Access Token
Short-lived credential for accessing an external service's API. Typically expires in 1 hour.

### Refresh Token
Long-lived credential used to obtain new access tokens when they expire.

## Technical Terms

### RLS (Row-Level Security)
PostgreSQL feature enabling multi-tenant data isolation at the database level. Each query automatically filters data by Organization.

### AES-256-GCM
Encryption algorithm used to protect credentials at rest. AES-256 with Galois/Counter Mode provides both confidentiality and authenticity.

### Drizzle ORM
TypeScript-first ORM used for database access. Provides type-safe queries and schema definitions.

### Hono
High-performance TypeScript web framework used for the API server. Edge-ready and runs on Node.js, Bun, and Cloudflare Workers.

### BullMQ
Redis-based job queue used for background tasks like token refresh.

## AI & Integrations

### MCP (Model Context Protocol)
Anthropic's open standard for connecting AI models to external tools and data sources. Authlane provides tool definitions in MCP format.

### OpenAI Function Calling
OpenAI's format for defining callable functions that AI models can invoke. Authlane provides tool definitions in this format.

### Tool
A function that an AI agent can invoke. Tools have:
- Name (e.g., `github_create_issue`)
- Description
- Input schema (parameters)
- Associated Service

### Tool Definition
The schema describing a tool's interface. Authlane exports these in both MCP and OpenAI formats.

## Connection States

### Pending
Connection initiated but OAuth flow not completed.

### Connected
Successfully authenticated with valid credentials.

### Expired
Access token has expired and needs refresh.

### Error
Connection is in an error state (refresh failed, revoked, etc.).

## User Roles

### Owner
Full control over an Organization. Can delete the organization, manage all settings, and transfer ownership.

### Admin
Can manage services, connections, API keys, and invite members. Cannot delete the organization.

### Member
Can view connections and services. Cannot modify organization settings.

## API Response Format

### Supabase-Style Response
Authlane uses a consistent response format inspired by Supabase:

```typescript
interface Response<T> {
  data: T | null;      // Result data on success
  error: Error | null; // Error details on failure
}

interface Error {
  message: string;     // Human-readable error message
  code: string;        // Machine-readable error code
  hint?: string;       // How to fix the error
  docUrl?: string;     // Link to documentation
  statusCode: number;  // HTTP status code
}
```

## Infrastructure

### Monorepo
Single repository containing multiple packages and applications. Authlane uses Turborepo for build orchestration.

### Workspace
A package within the monorepo. Examples: `@authlane/api`, `@authlane/sdk`, `@authlane/database`.

### Turborepo
Build system for JavaScript/TypeScript monorepos. Handles task orchestration and caching.

### pnpm
Fast, disk-efficient package manager used by Authlane.
