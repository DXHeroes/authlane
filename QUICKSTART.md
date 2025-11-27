# Authlane Quick Start Guide

Get Authlane up and running in 5 minutes!

## Prerequisites

- Node.js 22+
- pnpm 8+
- Docker (optional, for local PostgreSQL/Redis)

## Step 1: Clone and Install

```bash
git clone <repo-url>
cd authlane
pnpm install
```

## Step 2: Set Up Database

### Option A: Using Docker (Recommended)

```bash
# Start PostgreSQL and Redis
docker-compose -f docker/docker-compose.yml up -d

# Wait for services to be ready
sleep 5
```

### Option B: Local PostgreSQL

Make sure PostgreSQL 16+ is running locally.

## Step 3: Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Generate encryption key
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env

# Update DATABASE_URL in .env
# For Docker: DATABASE_URL=postgresql://authlane:authlane@localhost:5432/authlane
# For local: DATABASE_URL=postgresql://user:password@localhost:5432/authlane
```

## Step 4: Database Setup

```bash
# Build packages
pnpm build

# Generate migrations
pnpm --filter @authlane/database generate

# Run migrations
pnpm --filter @authlane/database migrate

# Seed database (creates sample tenant and services)
pnpm --filter @authlane/database seed
```

The seed script will output:
- A test API key (save this!)
- Tenant ID

## Step 5: Start the API

```bash
pnpm --filter @authlane/api dev
```

The API will start on `http://localhost:3000`

## Step 6: Test the API

### Health Check

```bash
curl http://localhost:3000/health
```

### List Services

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/api/v1/services
```

### List Connections for a User

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/api/v1/users/user_123/connections
```

### Start OAuth Flow

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/v1/users/user_123/connections/github/authorize?client_id=YOUR_GITHUB_CLIENT_ID&redirect_uri=http://localhost:3000/callback"
```

## API Endpoints

- `GET /health` - Health check (no auth)
- `GET /api/v1/services` - List available services
- `GET /api/v1/services/:id` - Get service details
- `GET /api/v1/users/:userId/connections` - List user connections
- `GET /api/v1/users/:userId/connections/:serviceId` - Get connection details
- `GET /api/v1/users/:userId/connections/:serviceId/credentials` - Get decrypted credentials
- `GET /api/v1/users/:userId/connections/:serviceId/health` - Check connection health
- `GET /api/v1/users/:userId/connections/:serviceId/authorize` - Start OAuth flow
- `GET /api/v1/users/:userId/connections/:serviceId/callback` - OAuth callback
- `GET /api/v1/users/:userId/tools?format=mcp` - Get tool definitions

## Authentication

All API endpoints (except `/health`) require authentication via API key:

```
Authorization: Bearer YOUR_API_KEY
```

or

```
Authorization: ApiKey YOUR_API_KEY
```

## Next Steps

1. **Create your own tenant**: Use the dashboard (coming soon) or insert directly into the database
2. **Add more integrations**: See `integrations/` directory for examples
3. **Build your AI agent**: Use the credentials and tools API to integrate with your agent

## Troubleshooting

### Database Connection Issues

- Check PostgreSQL is running: `docker ps` or `pg_isready`
- Verify DATABASE_URL in `.env` is correct
- Check PostgreSQL logs: `docker logs <container-name>`

### Migration Issues

- Make sure you've run `pnpm build` first
- Check that DATABASE_URL is set correctly
- Try running migrations manually: `pnpm --filter @authlane/database migrate`

### API Not Starting

- Check ENCRYPTION_KEY is set (64 hex characters)
- Verify all packages built successfully: `pnpm build`
- Check for port conflicts (default: 3000)

---

For more details, see [README.md](./README.md) and [AGENTS.md](./AGENTS.md)

