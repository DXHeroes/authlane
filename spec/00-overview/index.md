# Overview

This section provides a high-level overview of the Authlane project, including terminology, implementation status, and roadmap.

## Contents

- [Glossary](./glossary.md) - Key terms and definitions
- [Project Status](./project-status.md) - Current implementation status
- [Roadmap](./roadmap.md) - Feature roadmap and milestones
- [Pricing](./pricing.md) - Pricing tiers and business model

## What is Authlane?

Authlane is an **integrations-as-a-service** platform designed specifically for AI agents and SaaS applications. It solves the complexity of managing OAuth2 flows, API credentials, and tool definitions for multiple third-party services.

### The Problem

SaaS providers building AI-powered applications face significant challenges:

1. **OAuth2 Complexity** - Each service (Google, Slack, GitHub, Salesforce) has unique OAuth flows, scopes, token refresh logic, and edge cases
2. **Credential Management** - Secure storage requires encryption, rotation, audit logs, and compliance
3. **Per-User Integrations** - Each end-user needs their own connections, requiring multi-tenant architecture
4. **Integration Maintenance** - APIs change, tokens expire, OAuth apps require verification
5. **AI Agent Protocols** - Standards like MCP require specific tool definition formats

### The Solution

Authlane provides:

- **Centralized Credential Management** - OAuth tokens and API keys encrypted at rest
- **Tool Definitions** - MCP and OpenAI function calling formats
- **Connection UI** - Embeddable widget for end-user service connection
- **Multi-Tenancy** - Organization-based isolation with Row-Level Security
- **Automatic Token Refresh** - Background jobs handle token lifecycle

### Key Principle: Not a Middleware

Authlane is **not** a proxy or middleware. It provides:
- Credentials (OAuth tokens, API keys)
- Tool definitions (MCP, OpenAI formats)
- Connection status

Your AI agents then call external services **directly** with credentials from Authlane, ensuring:
- Lower latency (no extra hop)
- Full control over API calls
- No data passing through Authlane

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                    SaaS Application                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│  │   AI Agent  │    │  Frontend   │    │   Backend API   │  │
│  └──────┬──────┘    └──────┬──────┘    └────────┬────────┘  │
│         │                  │                     │           │
└─────────┼──────────────────┼─────────────────────┼───────────┘
          │                  │                     │
          │ 3. Call external │ 1. Show connection │ 2. Get credentials
          │    APIs directly │    UI (iframe/SDK) │    & tool configs
          ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                        Authlane                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│  │ Credentials │    │ Connection  │    │ Tool Definitions│  │
│  │   Vault     │    │     UI      │    │ (MCP, OpenAI)   │  │
│  └─────────────┘    └─────────────┘    └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Target Audiences

### SaaS Developers (Integrators)
Build AI agents and applications that connect to multiple third-party services without implementing OAuth flows for each one.

### Internal Development Team
Contributors working on the Authlane codebase itself.

### End Users
Users of SaaS applications built with Authlane who connect their personal accounts (GitHub, Slack, etc.).

### System Administrators
DevOps and IT professionals who deploy and maintain Authlane instances.

## License

Authlane is licensed under the **Elastic License 2.0** (ELv2):
- ✅ Self-hosting for internal use
- ✅ Code modifications
- ✅ Commercial use in your own products
- ❌ Offering Authlane as a managed service (competing with cloud version)
