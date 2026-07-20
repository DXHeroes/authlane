# Component Architecture

Detailed breakdown of Authlane's internal components, packages, and their responsibilities.

## Monorepo Structure

Authlane uses a monorepo structure managed by Turborepo with pnpm workspaces.

```
authlane/
├── apps/                    # Deployable applications
├── packages/                # Shared libraries
├── integrations/            # Service integrations
├── docker/                  # Container configurations
├── scripts/                 # Development scripts
├── e2e/                     # End-to-end tests
└── spec/                    # Documentation
```

---

## Applications (`apps/`)

### API Server (`apps/api/`)

The main REST API server built with Hono.

**Responsibilities:**
- Handle all API requests
- OAuth flow management
- Credential encryption/decryption
- Session and API key authentication
- Rate limiting
- Background job scheduling

**Technology:** Node.js, Hono, TypeScript

**Key Files:**
```
apps/api/
├── src/
│   ├── index.ts              # Application entry point
│   ├── types.ts              # TypeScript definitions
│   ├── routes/               # API route handlers
│   │   ├── index.ts          # Route registration
│   │   ├── services.ts       # Services endpoints
│   │   ├── connections.ts    # Connections endpoints
│   │   ├── oauth.ts          # OAuth flow endpoints
│   │   ├── tools.ts          # Tool definitions
│   │   └── dashboard.ts      # Dashboard endpoints
│   ├── middleware/           # Hono middleware
│   │   ├── auth.ts           # Authentication
│   │   ├── rate-limit.ts     # Rate limiting
│   │   └── error-handler.ts  # Error handling
│   ├── lib/                  # Library code
│   │   ├── auth.ts           # Better Auth config
│   │   ├── logger.ts         # Pino logger
│   │   └── metrics.ts        # Prometheus metrics
│   └── utils/                # Utility functions
├── tests/                    # Unit tests
├── Dockerfile                # Container build
└── package.json
```

**Dependencies:**
- `@authlane/database` - Database access
- `@authlane/crypto` - Encryption
- `@authlane/shared` - Types and utilities
- `hono` - Web framework
- `better-auth` - Authentication
- `bullmq` - Job queue

---

### Dashboard (`apps/dashboard/`)

React-based admin dashboard for organization management.

**Responsibilities:**
- User authentication (login/register)
- Organization management
- Service configuration
- Connection monitoring
- API key management
- Team member management

**Technology:** React 19, Vite, Tailwind CSS, shadcn/ui

**Key Files:**
```
apps/dashboard/
├── src/
│   ├── main.tsx              # Application entry
│   ├── App.tsx               # Root component
│   ├── pages/                # Page components
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── DashboardHome.tsx
│   │   ├── ConnectionsPage.tsx
│   │   ├── ServicesPage.tsx
│   │   ├── ServiceDetailPage.tsx
│   │   ├── ApiKeysPage.tsx
│   │   ├── MembersPage.tsx
│   │   ├── OrganizationPage.tsx
│   │   └── SettingsPage.tsx
│   ├── components/           # Reusable components
│   │   ├── DashboardLayout.tsx
│   │   ├── OrganizationSelector.tsx
│   │   └── modals/
│   ├── context/              # React contexts
│   │   └── AuthContext.tsx
│   └── lib/                  # Utilities
│       ├── api.ts            # API client
│       └── auth-client.ts    # Better Auth client
└── package.json
```

---

### Example SaaS (`apps/example-saas/`)

Demonstration application showing Authlane integration.

**Responsibilities:**
- Demonstrate OAuth connection flow
- Show credential retrieval
- Example API usage patterns

**Key Features:**
- GitHub OAuth integration
- Repository listing
- Public API access (JSONPlaceholder)

---

### Widget (`apps/widget/`)

Embeddable React component for service connections.

**Responsibilities:**
- Provide drop-in connection UI
- Handle OAuth popup flows
- Display connection status

**Embedding:**
```html
<iframe src="https://authlane.com/widget?apiKey=...&userId=..." />
```

---

### Landing (`apps/landing/`)

Marketing website for Authlane.

**Sections:**
- Hero with value proposition
- Features overview
- Integration showcase
- Pricing tiers
- Documentation links

---

### Docs (`apps/docs/`)

Mintlify-based documentation site.

**Structure:**
```
apps/docs/
├── mint.json                 # Mintlify configuration
├── introduction.mdx
├── quickstart.mdx
├── api-reference/
├── sdk/
├── integrations/
└── guides/
```

---

## Packages (`packages/`)

### Database (`@authlane/database`)

Drizzle ORM schema and database utilities.

**Responsibilities:**
- Schema definitions
- Migration management
- Database client configuration
- Type exports

**Schema Files:**
```
packages/database/src/schema/
├── index.ts                  # Schema exports
├── auth.ts                   # User, session, account, org
├── connections.ts            # Connections table
├── services.ts               # Services table
└── organization-services.ts  # Org-service junction
```

**Exports:**
- `db` - Drizzle client instance
- `schema` - All table definitions
- Type definitions for all entities

---

### Crypto (`@authlane/crypto`)

Encryption utilities for credential security.

**Responsibilities:**
- AES-256-GCM encryption
- Key management utilities
- Secure random generation

**Exports:**
```typescript
export function encrypt(data: string): string;
export function decrypt(ciphertext: string): string;
export function getEncryptionKey(): Buffer;
```

---

### Shared (`@authlane/shared`)

Shared types, utilities, and constants.

**Contents:**
- TypeScript type definitions
- Error type definitions
- Utility functions
- Constants

---

### SDK (`@authlane/sdk`)

TypeScript SDK for Authlane API.

**Responsibilities:**
- Type-safe API client
- Connection management
- Tool retrieval
- Error handling

**Usage:**
```typescript
import { Authlane } from '@authlane/sdk';

const authlane = new Authlane({
  apiKey: 'ak_...',
  baseUrl: 'https://api.authlane.com',
});

const { data, error } = await authlane.connections.list({
  userId: 'user_123',
});
```

---

### React (`@authlane/react`)

React components and hooks for Authlane.

**Components:**
- `AuthlaneProvider` - Context provider
- `ConnectionButton` - One-click connect
- `ConnectionList` - Display connections
- `ConnectionStatus` - Status indicator

**Hooks:**
- `useAuthlane()` - Main context hook
- `useConnection(serviceId)` - Single connection
- `useConnections()` - All connections

---

### MCP Server (`@authlane/mcp-server`)

Model Context Protocol server implementation.

**Responsibilities:**
- Expose tools via MCP protocol
- Handle Claude Desktop integration
- Tool definition serving

**CLI:**
```bash
npx authlane-mcp --api-key ak_... --user-id user_123
```

---

### Email (`@authlane/email`)

Email templates and sending utilities.

**Templates:**
- Invitation email
- Password reset
- Connection notifications

**Technology:** React Email, Resend

---

## Integrations (`integrations/`)

Each integration is a self-contained package defining OAuth configuration and tool definitions.

**Standard Structure:**
```
integrations/{service}/
├── config.yaml               # OAuth and service config
├── tools.ts                  # Tool definitions
├── index.ts                  # Entry point
├── types.ts                  # TypeScript types
└── package.json
```

**Available Integrations:**
- github
- slack
- linear
- discord
- stripe
- airtable
- google-calendar
- google-drive
- gmail
- notion
- hubspot
- salesforce
- pipedrive
- jira

---

## Package Dependencies

```mermaid
graph TD
    API[apps/api] --> DB[@authlane/database]
    API --> CRYPTO[@authlane/crypto]
    API --> SHARED[@authlane/shared]

    Dashboard[apps/dashboard] --> SHARED

    SDK[@authlane/sdk] --> SHARED

    React[@authlane/react] --> SDK
    React --> SHARED

    MCP[@authlane/mcp-server] --> SDK

    DB --> SHARED
    CRYPTO --> SHARED
```

## Build Order

Turborepo handles build order based on dependencies:

1. `@authlane/shared` (no dependencies)
2. `@authlane/crypto` (depends on shared)
3. `@authlane/database` (depends on shared)
4. `@authlane/sdk` (depends on shared)
5. `@authlane/react` (depends on sdk, shared)
6. `@authlane/mcp-server` (depends on sdk)
7. `apps/api` (depends on database, crypto, shared)
8. `apps/dashboard` (depends on shared)
