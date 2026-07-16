# Authlane Specification Documentation

> **Security contract:** where older design examples conflict with the generated OpenAPI document,
> `SECURITY.md`, or `docs/security/OPERATIONS.md`, those three current documents take precedence.
> In particular, `ENCRYPTION_KEY`, unscoped API keys, browser API keys, and the legacy `GET
> .../credentials` endpoint are forbidden and unsupported.

Welcome to the Authlane technical specification and documentation. This folder contains comprehensive documentation for all audiences: developers, system administrators, end users, and the internal team.

## What is Authlane?

**Authlane** is an open-source platform for managing third-party integrations in AI agents and SaaS applications. It enables SaaS providers to offer their end-users the ability to connect external services (GitHub, Slack, Google, CRM systems, etc.) via OAuth2, API keys, or other credentials without building complex integration infrastructure.

**Key Principle:** Authlane is NOT a middleware - it serves as a central credentials and tool configuration manager. AI agents then call external services directly using information from the Authlane API.

## Documentation Structure

| Section | Description | Audience |
|---------|-------------|----------|
| [00-overview](./00-overview/) | Project overview, glossary, status, roadmap | Everyone |
| [01-architecture](./01-architecture/) | System design, components, data flows, diagrams | Developers, Architects |
| [02-database](./02-database/) | Database schema, tables, relationships, RLS | Developers, DBAs |
| [03-api-reference](./03-api-reference/) | Complete API documentation, OpenAPI spec | Developers |
| [04-security](./04-security/) | Security model, encryption, OAuth, threats | Security, DevOps |
| [05-sdk](./05-sdk/) | TypeScript, React, MCP server documentation | Developers |
| [06-integrations](./06-integrations/) | Service integrations, tool definitions | Developers |
| [07-user-guides](./07-user-guides/) | Getting started, dashboard manual, use cases | End Users |
| [08-deployment](./08-deployment/) | Self-hosting, cloud deployment, operations | DevOps, Admins |
| [09-development](./09-development/) | Contributing, testing, internal patterns | Contributors |
| [10-reference](./10-reference/) | Environment variables, error codes, changelog | Everyone |
| [appendices](./appendices/) | ADRs, templates | Contributors |

## Quick Links

### For Developers Integrating Authlane
1. [Getting Started Quickstart](./07-user-guides/getting-started/quickstart.md)
2. [TypeScript SDK](./05-sdk/typescript/index.md)
3. [API Reference](./03-api-reference/index.md)
4. [React Components](./05-sdk/react/index.md)

### For System Administrators
1. [Self-Hosting Guide](./08-deployment/self-hosting/docker-compose.md)
2. [Environment Variables](./10-reference/environment-variables.md)
3. [Security Model](./04-security/security-model.md)

### For End Users
1. [Dashboard Overview](./07-user-guides/dashboard/overview.md)
2. [Managing Connections](./07-user-guides/dashboard/managing-connections.md)
3. [Troubleshooting](./07-user-guides/troubleshooting/common-issues.md)

### For Contributors
1. [Contributing Guide](./09-development/contributing.md)
2. [Development Setup](./09-development/development-setup.md)
3. [Architecture Overview](./01-architecture/index.md)

## Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 22+ |
| API Framework | Hono |
| Database | PostgreSQL 16+ |
| ORM | Drizzle |
| Cache/Queue | Redis + BullMQ |
| Encryption | AES-256-GCM |
| Frontend | React + Tailwind + shadcn/ui |
| Monorepo | Turborepo + pnpm |
| Testing | Vitest + Playwright |

## Document Conventions

- **Code examples** are in TypeScript unless otherwise noted
- **API examples** include both cURL and SDK usage
- **Diagrams** use Mermaid format and can be rendered in GitHub or any Mermaid-compatible viewer
- **File references** use absolute paths from project root

## Version

This documentation is for **Authlane v1.0** (MVP).

Last updated: December 2025
