# Deployment Guide

This guide covers deploying Authlane to production.

## Prerequisites

- Node.js 20.x or later
- pnpm 9.x
- PostgreSQL 15+
- Redis 7+
- Domain name configured

## Production Environment Setup

### 1. Database Setup

#### Option A: Vercel Postgres
```bash
# Install Vercel CLI
npm i -g vercel

# Create database
vercel postgres create authlane-production
```

#### Option B: Railway PostgreSQL
```bash
# Install Railway CLI
npm i -g railway

# Login
railway login

# Create new project
railway init

# Add PostgreSQL
railway add postgresql

# Get connection string
railway variables
```

#### Option C: Supabase
```bash
# Create project at https://supabase.com
# Get connection string from Settings > Database

# Example:
# postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

#### Option D: Self-hosted
```bash
# Using Docker
docker run -d \
  --name authlane-postgres \
  -e POSTGRES_DB=authlane_production \
  -e POSTGRES_USER=authlane \
  -e POSTGRES_PASSWORD=your_secure_password \
  -p 5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  postgres:15-alpine
```

### 2. Redis Setup

#### Option A: Upstash Redis
```bash
# Create database at https://upstash.com
# Get REDIS_URL from console
# Already supports TLS by default
```

#### Option B: Railway Redis
```bash
# Add Redis to Railway project
railway add redis

# Get connection string
railway variables
```

#### Option C: Self-hosted
```bash
# Using Docker
docker run -d \
  --name authlane-redis \
  -p 6379:6379 \
  -v redis_data:/data \
  redis:7-alpine
```

### 3. Generate Encryption Keys

```bash
# Generate ENCRYPTION_KEY (32-byte hex)
openssl rand -hex 32

# Generate JWT_SECRET (32-byte hex)
openssl rand -hex 32
```

### 4. Configure Environment Variables

Copy `.env.production.example` to `.env.production` and fill in values:

```bash
cp .env.production.example .env.production
```

Edit `.env.production` with your actual credentials.

## Database Migration

Run migrations before deployment:

```bash
# Generate migration
pnpm --filter @authlane/database db:generate

# Apply migration
pnpm --filter @authlane/database db:push
```

## Application Deployment

### API Server Deployment

#### Option A: Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd apps/api
vercel --prod

# Add environment variables in Vercel dashboard
# Settings > Environment Variables
```

Create `vercel.json` in `apps/api`:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "src/index.ts",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "src/index.ts"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

#### Option B: Railway
```bash
# Deploy from GitHub
# 1. Connect GitHub repo at railway.app
# 2. Select apps/api directory
# 3. Add environment variables
# 4. Deploy
```

Create `railway.toml`:
```toml
[build]
builder = "NIXPACKS"
buildCommand = "pnpm install && pnpm build"

[deploy]
startCommand = "pnpm start"
healthcheckPath = "/health"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

#### Option C: Fly.io
```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Create app
fly launch --name authlane-api

# Deploy
fly deploy
```

Create `fly.toml`:
```toml
app = "authlane-api"
primary_region = "iad"

[build]
  [build.args]
    NODE_ENV = "production"

[env]
  PORT = "8080"
  NODE_ENV = "production"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

[[services]]
  protocol = "tcp"
  internal_port = 8080

  [[services.ports]]
    port = 80
    handlers = ["http"]
    force_https = true

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [services.concurrency]
    type = "connections"
    hard_limit = 1000
    soft_limit = 500

[[vm]]
  memory = '1gb'
  cpu_kind = 'shared'
  cpus = 1
```

### Dashboard & Widget Deployment

#### Deploy to Vercel
```bash
# Deploy dashboard
cd apps/dashboard
vercel --prod

# Deploy widget
cd apps/widget
vercel --prod
```

### Documentation Deployment

#### Deploy with Mintlify
```bash
# Install Mintlify CLI
npm i -g mintlify

# Initialize (if not done)
cd docs
mintlify install

# Deploy to Mintlify Cloud
mintlify deploy
```

## Monitoring Setup

### Sentry Integration

1. Create account at https://sentry.io
2. Create new project for Authlane
3. Get DSN and add to environment variables
4. Sentry is already integrated in the codebase

### Logging

Logging is configured with Pino and outputs JSON in production.

View logs:
```bash
# Vercel
vercel logs

# Railway
railway logs

# Fly.io
fly logs
```

### Metrics

Prometheus metrics are exposed at `/metrics` endpoint.

Set up Grafana dashboard:
1. Create Grafana Cloud account
2. Add Prometheus data source
3. Import dashboard from `monitoring/grafana-dashboard.json`

## Health Checks

The API exposes health check endpoints:

- `GET /health` - Basic health check
- `GET /health/ready` - Readiness check (DB + Redis)
- `GET /health/live` - Liveness check

## CI/CD

GitHub Actions workflows are configured in `.github/workflows/`.

Required secrets:
- `DATABASE_URL`
- `REDIS_URL`
- `ENCRYPTION_KEY`
- `SENTRY_DSN`

## Post-Deployment Checklist

- [ ] Verify DATABASE_URL connection
- [ ] Verify REDIS_URL connection
- [ ] Test health endpoints
- [ ] Verify Sentry error tracking
- [ ] Check logs are flowing
- [ ] Test OAuth flows
- [ ] Verify rate limiting
- [ ] Check metrics endpoint
- [ ] Test webhook delivery
- [ ] Verify email sending
- [ ] Run smoke tests

## Rollback Procedure

### Vercel
```bash
vercel rollback
```

### Railway
Use Railway dashboard to rollback to previous deployment

### Fly.io
```bash
fly releases
fly releases rollback [VERSION]
```

## Scaling

### Database
- Enable connection pooling
- Add read replicas for read-heavy workloads
- Monitor query performance

### Redis
- Use Redis Cluster for high availability
- Enable persistence (AOF or RDB)

### API Server
- Scale horizontally by increasing instances
- Use load balancer (automatically handled by platforms)
- Monitor response times and error rates

## Security

- [ ] Enable SSL/TLS everywhere
- [ ] Rotate encryption keys regularly
- [ ] Use secrets management (Vercel/Railway/Fly.io secrets)
- [ ] Enable rate limiting
- [ ] Set up CORS properly
- [ ] Enable security headers
- [ ] Regular security audits
- [ ] Keep dependencies updated

## Monitoring & Alerts

Set up alerts for:
- API error rate > 1%
- API response time > 500ms
- Database connection pool exhaustion
- Redis connection failures
- High memory usage
- High CPU usage

## Backup & Recovery

### Database Backups
```bash
# Automated backups (most platforms do this automatically)
# Manual backup
pg_dump $DATABASE_URL > backup.sql

# Restore
psql $DATABASE_URL < backup.sql
```

### Redis Backups
```bash
# Most managed Redis services handle this automatically
# Manual backup (if self-hosted)
redis-cli --rdb /backup/dump.rdb
```

## Support

For deployment issues:
- Check logs first
- Review health endpoints
- Consult platform documentation
- Open GitHub issue
