# Architecture

This section describes the technical architecture of Authlane, including system design, component structure, data flows, and design decisions.

## Contents

- [System Architecture](./system-architecture.md) - High-level system design and C4 diagrams
- [Component Architecture](./component-architecture.md) - Internal component structure
- [Data Flow](./data-flow.md) - Request/response flows and sequences
- [Multi-Tenancy](./multi-tenancy.md) - Organization-based multi-tenancy model
- [Security Architecture](./security-architecture.md) - Defense-in-depth security layers
- [Frontend Stack](./frontend-stack.md) - Frontend technologies (React, Tailwind, etc.)
- [Diagrams](./diagrams/) - Mermaid diagrams for all flows

## Architecture Principles

### 1. Not a Middleware
Authlane provides credentials and tool definitions but does NOT proxy API calls. AI agents call external services directly, ensuring:
- Lower latency
- No data passing through Authlane
- Full control for developers

### 2. Security First
- Encryption at rest (AES-256-GCM)
- Encryption in transit (TLS 1.3)
- OAuth 2.0 with mandatory PKCE
- Row-Level Security for tenant isolation

### 3. Multi-Tenant by Design
Every component considers multi-tenancy from the ground up:
- Organization-scoped API keys
- Database-level isolation (RLS)
- Per-organization service configuration

### 4. Developer Experience
- TypeScript-first APIs
- Supabase-style error handling
- Comprehensive SDK
- Self-documenting API (OpenAPI)

### 5. Cloud-Native
- Containerized deployment
- Stateless API servers
- External state (PostgreSQL, Redis)
- Horizontal scalability

## Technology Stack Summary

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Runtime** | Node.js 22+ | JavaScript runtime |
| **API Framework** | Hono | High-performance HTTP server |
| **Database** | PostgreSQL 16+ | Primary data store |
| **ORM** | Drizzle | Type-safe database access |
| **Cache** | Redis | Session cache, job queue |
| **Queue** | BullMQ | Background job processing |
| **Encryption** | Node.js crypto | AES-256-GCM encryption |
| **Frontend** | React 19 | Dashboard and widget |
| **Styling** | Tailwind CSS | Utility-first CSS |
| **State Management** | Tanstack Query | Server state management |
| **Build** | Turborepo | Monorepo orchestration |
| **Package Manager** | pnpm | Efficient dependency management |

## Repository Structure

```
authlane/
├── apps/                    # Applications
│   ├── api/                 # API server (Hono)
│   ├── dashboard/           # Admin dashboard (React)
│   ├── example-saas/        # Example integration
│   ├── widget/              # Connection widget
│   ├── landing/             # Marketing site
│   └── docs/                # Documentation (Mintlify)
├── packages/                # Shared packages
│   ├── database/            # Drizzle schema
│   ├── crypto/              # Encryption utilities
│   ├── shared/              # Types and utilities
│   ├── sdk/                 # TypeScript SDK
│   ├── react/               # React components
│   ├── mcp-server/          # MCP server
│   └── email/               # Email templates
├── integrations/            # Service integrations
│   ├── github/
│   ├── slack/
│   └── ...
├── docker/                  # Container configs
├── scripts/                 # Development scripts
└── spec/                    # This documentation
```

## Key Design Decisions

See [appendices/adr/](../appendices/adr/) for detailed Architecture Decision Records:

1. **Hono Framework** - Chosen for TypeScript-native support and edge compatibility
2. **Drizzle ORM** - Selected for type safety and lightweight footprint
3. **AES-256-GCM** - Industry-standard encryption for credentials
4. **PKCE for OAuth** - Mandatory to prevent authorization code interception
5. **Supabase-style Errors** - Consistent, helpful error responses
