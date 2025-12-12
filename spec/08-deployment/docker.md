# Docker Deployment

Deploy Authlane using Docker and Docker Compose.

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- 2GB RAM minimum (4GB recommended)
- Domain with SSL certificate (for production)

## Quick Start

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
ENCRYPTION_KEY=your-32-byte-base64-key  # Generate with: openssl rand -base64 32

# Optional but recommended for production
NODE_ENV=production
LOG_LEVEL=info
CORS_ORIGINS=https://your-domain.com

# OAuth providers (add as needed)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

### 3. Generate Encryption Key

```bash
openssl rand -base64 32
# Example output: K7gNU3sdo+OL0wNhqoVWhr3g6s1xYv72ol/pe/Unols=
```

### 4. Start Services

```bash
docker compose up -d
```

### 5. Run Migrations

```bash
docker compose exec api pnpm db:migrate
```

### 6. Access Services

- API: http://localhost:3000
- Dashboard: http://localhost:3001

## Docker Compose Configuration

### docker-compose.yml

```yaml
version: '3.8'

services:
  api:
    build:
      context: .
      dockerfile: docker/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL
      - REDIS_URL
      - ENCRYPTION_KEY
      - NODE_ENV=production
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  dashboard:
    build:
      context: .
      dockerfile: docker/Dockerfile.dashboard
    ports:
      - "3001:3001"
    environment:
      - API_URL=http://api:3000
    depends_on:
      - api
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=authlane
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

## Production Configuration

### docker-compose.prod.yml

```yaml
version: '3.8'

services:
  api:
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  db:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G

  redis:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
```

Run with:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Reverse Proxy Setup

### Nginx Configuration

```nginx
upstream authlane_api {
    server localhost:3000;
}

upstream authlane_dashboard {
    server localhost:3001;
}

server {
    listen 80;
    server_name api.authlane.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.authlane.yourdomain.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    location / {
        proxy_pass http://authlane_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 443 ssl http2;
    server_name dashboard.authlane.yourdomain.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    location / {
        proxy_pass http://authlane_dashboard;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Traefik Configuration

```yaml
# docker-compose.yml addition
services:
  traefik:
    image: traefik:v2.10
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./traefik:/etc/traefik
    labels:
      - "traefik.enable=true"

  api:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`api.yourdomain.com`)"
      - "traefik.http.routers.api.tls=true"
      - "traefik.http.routers.api.tls.certresolver=letsencrypt"
```

## Updating

### Update to Latest Version

```bash
# Pull latest changes
git pull origin main

# Rebuild containers
docker compose build

# Apply migrations
docker compose exec api pnpm db:migrate

# Restart services
docker compose up -d
```

### Zero-Downtime Update

```bash
# Build new image
docker compose build api

# Scale up new containers
docker compose up -d --scale api=4 --no-recreate

# Wait for health checks
sleep 30

# Scale down old containers
docker compose up -d --scale api=2
```

## Backup and Restore

### Backup Database

```bash
# Backup
docker compose exec db pg_dump -U postgres authlane > backup.sql

# Or with compression
docker compose exec db pg_dump -U postgres authlane | gzip > backup.sql.gz
```

### Restore Database

```bash
# Restore
cat backup.sql | docker compose exec -T db psql -U postgres authlane

# From compressed
gunzip -c backup.sql.gz | docker compose exec -T db psql -U postgres authlane
```

### Backup Redis

```bash
# Trigger save
docker compose exec redis redis-cli BGSAVE

# Copy dump file
docker cp authlane-redis-1:/data/dump.rdb ./redis-backup.rdb
```

## Troubleshooting

### Check Logs

```bash
# All services
docker compose logs

# Specific service
docker compose logs api

# Follow logs
docker compose logs -f api
```

### Check Container Health

```bash
docker compose ps
docker compose exec api curl http://localhost:3000/health
```

### Reset Everything

```bash
# Stop and remove all
docker compose down -v

# Start fresh
docker compose up -d
docker compose exec api pnpm db:migrate
```

## Next Steps

- [Environment Variables](./environment-variables.md)
- [Operations Guide](./operations.md)
- [Security Checklist](../04-security/index.md)

