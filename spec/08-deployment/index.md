# Deployment Documentation

> These design-era deployment notes are superseded by the root `DEPLOYMENT.md` and
> `docs/security/OPERATIONS.md`; never use the removed single `ENCRYPTION_KEY` configuration.

Guides for deploying Authlane in various environments.

## Contents

- [Docker Deployment](./docker.md) - Deploy with Docker Compose
- [Manual Installation](./manual.md) - Traditional server deployment
- [Cloud Platforms](./cloud-platforms.md) - Railway, Render, AWS, etc.
- [Environment Variables](./environment-variables.md) - Configuration reference
- [Operations](./operations.md) - Monitoring, backups, scaling

## Deployment Options

| Option | Best For | Complexity |
|--------|----------|------------|
| Docker Compose | Self-hosted, small teams | Low |
| Manual | Custom environments | Medium |
| Railway/Render | Quick deployment | Low |
| Kubernetes | Large scale, enterprise | High |

## Quick Start: Docker Compose

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- 2GB RAM minimum

### 1. Clone Repository

```bash
git clone https://github.com/authlane/authlane.git
cd authlane
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Required
DATABASE_URL=postgresql://postgres:postgres@db:5432/authlane
REDIS_URL=redis://redis:6379
ENCRYPTION_KEY=your-32-byte-key-here

# Generate with: openssl rand -base64 32

# Optional
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-secret
```

### 3. Start Services

```bash
docker compose up -d
```

### 4. Run Migrations

```bash
docker compose exec api pnpm db:migrate
```

### 5. Access Dashboard

Open http://localhost:3000

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `ENCRYPTION_KEY` | 32-byte encryption key (base64) |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | API server port |
| `NODE_ENV` | development | Environment mode |
| `LOG_LEVEL` | info | Logging level |
| `CORS_ORIGINS` | * | Allowed CORS origins |

### Service Credentials

| Variable | Description |
|----------|-------------|
| `GITHUB_CLIENT_ID` | GitHub OAuth app ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth secret |
| `SLACK_CLIENT_ID` | Slack OAuth app ID |
| `SLACK_CLIENT_SECRET` | Slack OAuth secret |

## Architecture Overview

```
┌─────────────────────────────────────────┐
│              Load Balancer              │
│           (nginx / cloudflare)          │
└─────────────────┬───────────────────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
    ▼             ▼             ▼
┌───────┐    ┌───────┐    ┌───────┐
│  API  │    │  API  │    │  API  │
│ Node  │    │ Node  │    │ Node  │
└───┬───┘    └───┬───┘    └───┬───┘
    │            │            │
    └────────────┼────────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
    ▼            ▼            ▼
┌───────┐  ┌──────────┐  ┌───────┐
│ Redis │  │PostgreSQL│  │ Workers│
└───────┘  └──────────┘  └───────┘
```

## Security Checklist

- [ ] HTTPS enabled (TLS 1.2+)
- [ ] Strong encryption key generated
- [ ] Database credentials secured
- [ ] Environment variables not in code
- [ ] CORS configured properly
- [ ] Rate limiting enabled
- [ ] Firewall rules configured
- [ ] Backups configured

## Scaling

### Horizontal Scaling

```yaml
# docker-compose.prod.yml
services:
  api:
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '1'
          memory: 1G
```

### Database Scaling

- Use connection pooling (PgBouncer)
- Read replicas for heavy read workloads
- Consider managed PostgreSQL (RDS, Cloud SQL)

### Redis Scaling

- Redis Cluster for high availability
- Consider managed Redis (ElastiCache, Upstash)

## Next Steps

- [Docker Deployment](./docker.md) - Detailed Docker guide
- [Environment Variables](./environment-variables.md) - Full reference
- [Operations](./operations.md) - Monitoring and maintenance
