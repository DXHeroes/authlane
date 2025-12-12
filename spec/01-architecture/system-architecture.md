# System Architecture

High-level system design and architecture diagrams for Authlane.

## System Context Diagram

This diagram shows Authlane's position in the broader ecosystem.

```mermaid
C4Context
    title System Context Diagram - Authlane

    Person(saas_dev, "SaaS Developer", "Builds AI-powered applications")
    Person(end_user, "End User", "User of SaaS applications")
    Person(admin, "Admin", "Manages organization settings")

    System(authlane, "Authlane", "Credential management and tool configuration platform")

    System_Ext(saas_app, "SaaS Application", "AI-powered application built by SaaS developer")
    System_Ext(oauth_providers, "OAuth Providers", "GitHub, Slack, Google, etc.")
    System_Ext(external_apis, "External APIs", "Third-party service APIs")

    Rel(saas_dev, authlane, "Configures integrations", "Dashboard/API")
    Rel(admin, authlane, "Manages organization", "Dashboard")
    Rel(end_user, saas_app, "Uses application")
    Rel(saas_app, authlane, "Gets credentials & tools", "REST API")
    Rel(authlane, oauth_providers, "OAuth flows", "OAuth 2.0")
    Rel(saas_app, external_apis, "Calls directly with credentials", "REST/GraphQL")
```

## Container Diagram

Shows the major containers (deployable units) within Authlane.

```mermaid
C4Container
    title Container Diagram - Authlane

    Person(user, "User", "SaaS developer or admin")

    Container_Boundary(authlane, "Authlane") {
        Container(api, "API Server", "Node.js, Hono", "Handles all API requests")
        Container(dashboard, "Dashboard", "React, Vite", "Admin web interface")
        Container(widget, "Widget", "React", "Embeddable connection UI")

        ContainerDb(postgres, "PostgreSQL", "Database", "Stores users, orgs, connections")
        ContainerDb(redis, "Redis", "Cache/Queue", "Session cache, job queue")
    }

    System_Ext(oauth, "OAuth Providers", "External auth providers")

    Rel(user, dashboard, "Manages settings", "HTTPS")
    Rel(user, api, "API calls", "HTTPS")
    Rel(dashboard, api, "API requests", "REST")
    Rel(widget, api, "OAuth flow", "REST")
    Rel(api, postgres, "Reads/Writes", "TCP")
    Rel(api, redis, "Cache/Queue", "TCP")
    Rel(api, oauth, "OAuth flows", "HTTPS")
```

## Component Diagram - API Server

Detailed view of the API server's internal components.

```mermaid
C4Component
    title Component Diagram - API Server

    Container_Boundary(api, "API Server") {
        Component(routes, "Routes", "Hono Routes", "HTTP endpoint handlers")
        Component(middleware, "Middleware", "Hono Middleware", "Auth, rate limit, errors")
        Component(services, "Services", "Business Logic", "Core business operations")
        Component(db_client, "DB Client", "Drizzle", "Database access layer")
        Component(crypto, "Crypto", "Node.js crypto", "Encryption/decryption")
        Component(queue, "Queue", "BullMQ", "Background job processing")
    }

    ContainerDb(postgres, "PostgreSQL", "Database")
    ContainerDb(redis, "Redis", "Cache/Queue")

    Rel(routes, middleware, "Uses")
    Rel(routes, services, "Calls")
    Rel(services, db_client, "Queries")
    Rel(services, crypto, "Encrypts/Decrypts")
    Rel(services, queue, "Schedules jobs")
    Rel(db_client, postgres, "SQL")
    Rel(queue, redis, "Jobs")
```

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Authlane Cloud                              │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │   API        │  │  Dashboard   │  │  Connection  │  │   Docs      │ │
│  │   Server     │  │   (React)    │  │   Widget     │  │  (Mintlify) │ │
│  │   (Hono)     │  │              │  │   (React)    │  │             │ │
│  └──────┬───────┘  └──────────────┘  └──────────────┘  └─────────────┘ │
│         │                                                               │
│  ┌──────┴───────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │  PostgreSQL  │  │    Redis     │  │   Vault      │  │  Queue      │ │
│  │  (RLS)       │  │   (Cache)    │  │ (Encryption) │  │  (BullMQ)   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

## Request Flow Architecture

### API Request Flow

```
Client Request
      │
      ▼
┌─────────────────┐
│  Load Balancer  │  (Optional in production)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Hono Server   │
│  ┌───────────┐  │
│  │ Middleware│  │  1. Sentry (error tracking)
│  │   Stack   │  │  2. Logger (request logging)
│  │           │  │  3. CORS (cross-origin)
│  │           │  │  4. Rate Limit
│  │           │  │  5. Auth (session/API key)
│  └─────┬─────┘  │
│        │        │
│  ┌─────▼─────┐  │
│  │  Routes   │  │  Route handlers
│  └─────┬─────┘  │
│        │        │
│  ┌─────▼─────┐  │
│  │ Services  │  │  Business logic
│  └─────┬─────┘  │
│        │        │
└────────┼────────┘
         │
    ┌────┴────┬──────────┐
    │         │          │
    ▼         ▼          ▼
┌───────┐ ┌───────┐ ┌───────┐
│Postgres│ │ Redis │ │ Queue │
└───────┘ └───────┘ └───────┘
```

## Deployment Architecture

### Single-Node Deployment (Development/Small Scale)

```
┌─────────────────────────────────────────┐
│              Docker Host                 │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │   API   │ │Postgres │ │  Redis  │   │
│  │ :3000   │ │ :5432   │ │ :6379   │   │
│  └─────────┘ └─────────┘ └─────────┘   │
└─────────────────────────────────────────┘
```

### Production Deployment (High Availability)

```
                    ┌─────────────────┐
                    │  Load Balancer  │
                    │   (nginx/ALB)   │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
    │  API Pod 1  │   │  API Pod 2  │   │  API Pod N  │
    └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
           │                 │                 │
           └─────────────────┼─────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
       ┌──────────┐   ┌──────────┐   ┌──────────┐
       │ Postgres │   │  Redis   │   │  Redis   │
       │ Primary  │   │ Primary  │   │ Replica  │
       └────┬─────┘   └──────────┘   └──────────┘
            │
       ┌────▼─────┐
       │ Postgres │
       │ Replica  │
       └──────────┘
```

## Key Architectural Characteristics

### Scalability
- **Horizontal scaling**: Stateless API servers can be replicated
- **Database scaling**: Read replicas for PostgreSQL
- **Cache scaling**: Redis cluster for high throughput

### Reliability
- **Health checks**: `/health` endpoint for load balancers
- **Graceful shutdown**: Proper connection draining
- **Retry logic**: Exponential backoff for external calls

### Security
- **Defense in depth**: Multiple security layers
- **Encryption**: At rest and in transit
- **Isolation**: Multi-tenant RLS

### Observability
- **Metrics**: Prometheus format at `/metrics`
- **Logging**: Structured JSON logs (Pino)
- **Tracing**: Sentry for error tracking

## Network Requirements

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| API | 3000 | HTTP/HTTPS | API requests |
| PostgreSQL | 5432 | TCP | Database |
| Redis | 6379 | TCP | Cache/Queue |
| Dashboard | 3001 | HTTP/HTTPS | Admin UI |

## External Dependencies

| Service | Purpose | Required |
|---------|---------|----------|
| PostgreSQL | Primary database | Yes |
| Redis | Cache and job queue | Optional* |
| SMTP/Resend | Email delivery | Optional |
| Sentry | Error tracking | Optional |

*Redis is optional but required for token refresh jobs.
