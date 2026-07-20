# Data Flow

Request/response flows and sequence diagrams for key Authlane operations.

## OAuth Connection Flow

The complete flow when a user connects a service via OAuth.

```mermaid
sequenceDiagram
    participant User as End User
    participant SaaS as SaaS App
    participant Authlane as Authlane API
    participant OAuth as OAuth Provider
    participant DB as PostgreSQL

    User->>SaaS: Click "Connect GitHub"
    SaaS->>Authlane: GET /authorize?service=github

    Note over Authlane: Generate PKCE code_verifier
    Note over Authlane: Generate state token

    Authlane->>DB: Create pending connection
    Authlane-->>SaaS: Return authorization URL
    SaaS->>User: Redirect to OAuth provider

    User->>OAuth: Authenticate & authorize
    OAuth-->>User: Redirect to callback with code

    User->>Authlane: GET /callback?code=xxx&state=yyy

    Note over Authlane: Validate state parameter

    Authlane->>OAuth: POST /token (exchange code)
    OAuth-->>Authlane: Return tokens

    Note over Authlane: Encrypt credentials

    Authlane->>DB: Update connection (status=connected)
    Authlane-->>User: Redirect to success URL

    opt Token refresh enabled
        Authlane->>Redis: Schedule refresh job
    end
```

## Credential Retrieval Flow

How credentials are retrieved for external API calls.

```mermaid
sequenceDiagram
    participant Agent as AI Agent
    participant SaaS as SaaS Backend
    participant Authlane as Authlane API
    participant DB as PostgreSQL
    participant External as External API

    Agent->>SaaS: Execute tool (e.g., create GitHub issue)
    SaaS->>Authlane: POST /users/{userId}/connections/github/credential-leases

    Note over Authlane: Validate API key
    Note over Authlane: Check organization access

    Authlane->>DB: Fetch encrypted credentials

    Note over Authlane: Audit access and decrypt access-only material

    alt Token expired
        Note over Authlane: Attempt token refresh
        Authlane->>External: POST /oauth/token (refresh)
        External-->>Authlane: New access token
        Note over Authlane: Re-encrypt and store
    end

    Authlane-->>SaaS: Return decrypted credentials
    SaaS->>External: API call with access token
    External-->>SaaS: API response
    SaaS-->>Agent: Tool result
```

## API Authentication Flow

How requests are authenticated via session or API key.

```mermaid
sequenceDiagram
    participant Client
    participant API as API Server
    participant Auth as Auth Middleware
    participant DB as PostgreSQL

    Client->>API: Request with credentials
    API->>Auth: Process request

    alt Cookie-based session
        Auth->>Auth: Extract session cookie
        Auth->>DB: Validate session
        DB-->>Auth: User + Organization
    else API Key (Bearer/ApiKey)
        Auth->>Auth: Extract API key from header
        Note over Auth: Hash API key (SHA-256)
        Auth->>DB: Find organization by key hash
        DB-->>Auth: Organization
    end

    alt Authentication successful
        Auth->>API: Set context (user, org, apiKey)
        API->>API: Process request
        API-->>Client: Response
    else Authentication failed
        Auth-->>Client: 401 Unauthorized
    end
```

## Tool Definition Flow

How tool definitions are retrieved for AI agents.

```mermaid
sequenceDiagram
    participant Agent as AI Agent
    participant SaaS as SaaS Backend
    participant Authlane as Authlane API
    participant DB as PostgreSQL
    participant Integrations as Integrations

    Agent->>SaaS: Request available tools
    SaaS->>Authlane: GET /users/{userId}/tools?format=mcp

    Authlane->>DB: Get user's connected services
    DB-->>Authlane: [github, slack]

    loop For each connected service
        Authlane->>Integrations: Load tool definitions
        Integrations-->>Authlane: Tool schemas
    end

    Note over Authlane: Format as MCP or OpenAI

    Authlane-->>SaaS: Tool definitions array
    SaaS-->>Agent: Available tools
```

## Dashboard Data Flow

How the dashboard loads and displays data.

```mermaid
sequenceDiagram
    participant Browser
    participant Dashboard
    participant API as Authlane API
    participant DB as PostgreSQL

    Browser->>Dashboard: Load dashboard
    Dashboard->>API: GET /api/auth/session
    API-->>Dashboard: User + Active Organization

    par Parallel requests
        Dashboard->>API: GET /api/v1/dashboard/stats
        API->>DB: Query stats
        DB-->>API: Stats data
        API-->>Dashboard: { totalConnections, activeUsers, ... }
    and
        Dashboard->>API: GET /api/v1/connections
        API->>DB: Query connections
        DB-->>API: Connections list
        API-->>Dashboard: Connections array
    end

    Dashboard->>Browser: Render dashboard
```

## Token Refresh Flow

Background job for automatic token refresh.

```mermaid
sequenceDiagram
    participant Queue as BullMQ
    participant Worker as Refresh Worker
    participant DB as PostgreSQL
    participant OAuth as OAuth Provider

    Note over Queue: Job triggered (token expiring)

    Queue->>Worker: Process refresh job
    Worker->>DB: Get connection + encrypted tokens

    Note over Worker: Decrypt credentials

    Worker->>OAuth: POST /oauth/token (refresh_token)

    alt Refresh successful
        OAuth-->>Worker: New tokens
        Note over Worker: Encrypt new tokens
        Worker->>DB: Update credentials + expires_at

        opt Token has new expiry
            Worker->>Queue: Schedule next refresh
        end
    else Refresh failed
        OAuth-->>Worker: Error (401, invalid_grant)
        Worker->>DB: Update status = 'expired'

        opt Webhook configured
            Worker->>Webhook: Notify connection expired
        end
    end
```

## Encryption/Decryption Flow

How credentials are encrypted and decrypted. The deployment KEK stays outside PostgreSQL.

```mermaid
sequenceDiagram
    participant Service as Service Layer
    participant Vault as Secret Vault
    participant Keys as External Keyring
    participant DB as PostgreSQL

    Note over Service: Storing credentials

    Service->>Vault: write(credentials, tenant, purpose)
    Vault->>Vault: Generate random per-record DEK and nonce
    Vault->>Vault: AES-256-GCM encrypt credentials
    Vault->>Keys: Wrap DEK with current versioned KEK
    Vault->>DB: Store ciphertext, wrapped DEK, nonce, tag, key ID, bound metadata
    Vault-->>Service: secret record ID

    Note over Service: Retrieving credentials

    Service->>Vault: read(secret ID, tenant, purpose)
    Vault->>DB: Fetch encrypted record
    Vault->>Keys: Unwrap DEK by key ID
    Vault->>Vault: Verify bound metadata and GCM tag, then decrypt
    Vault-->>Service: plaintext credentials in short-lived memory
```

## Multi-Tenant Data Access

How RLS ensures tenant isolation.

```mermaid
sequenceDiagram
    participant API as API Server
    participant Middleware as Auth Middleware
    participant DB as PostgreSQL
    participant RLS as RLS Policies

    API->>Middleware: Incoming request
    Middleware->>Middleware: Authenticate (session/API key)
    Middleware->>API: Set organization context

    API->>DB: Query connections

    Note over DB: Execute query

    DB->>RLS: Check RLS policies

    Note over RLS: Filter by organization_id
    Note over RLS: Only return matching rows

    RLS-->>DB: Filtered results
    DB-->>API: Organization-scoped data
```

## Webhook Notification Flow

How webhooks are triggered for connection events.

```mermaid
sequenceDiagram
    participant Event as Connection Event
    participant API as API Server
    participant DB as PostgreSQL
    participant Queue as Job Queue
    participant Webhook as Customer Webhook

    Event->>API: Connection status changed
    API->>DB: Update connection status
    API->>DB: Get organization webhook config

    alt Webhook configured
        DB-->>API: { webhookUrl, webhookSecret }
        API->>Queue: Schedule webhook job

        Queue->>Queue: Process job

        Note over Queue: Create HMAC signature
        Note over Queue: POST to webhookUrl

        Queue->>Webhook: POST /webhook { event, data }

        alt Success
            Webhook-->>Queue: 200 OK
        else Failure
            Webhook-->>Queue: Error
            Note over Queue: Retry with backoff
        end
    end
```

## Request Lifecycle

Complete lifecycle of an API request.

```
1. Request arrives at Hono server
   │
2. Logger middleware (request logging)
   │
3. Error handler middleware (try/catch wrapper)
   │
5. CORS middleware (cross-origin headers)
   │
6. Rate limit middleware (check limits)
   │
7. Auth middleware (session/API key validation)
   │
8. Route handler (business logic)
   │  ├── Validate input (Zod)
   │  ├── Database operations (Drizzle)
   │  ├── Encryption operations (Crypto)
   │  └── External calls (if needed)
   │
9. Response formatting (Supabase-style)
   │
10. Response sent to client
```
