# Deployment

Authlane ships as one production image. That process serves the dashboard, connect UI, authentication, OAuth callbacks, and control-plane API on one origin. PostgreSQL and Redis are dependencies, not additional Authlane services.

## Self-hosted Compose

```bash
cp .env.example .env
openssl rand -hex 32
openssl rand -base64 32
```

Set the generated values as `ENCRYPTION_KEY` and `BETTER_AUTH_SECRET`, set `APP_URL` to the public HTTPS origin, then run:

```bash
docker compose up --build -d
docker compose ps
curl --fail https://authlane.example.com/health
```

The application container runs the Drizzle migration before starting. Only port 3000 is published by default; terminate TLS at your reverse proxy or platform load balancer.

Optional Prometheus and Grafana:

```bash
docker compose --profile monitoring up -d
```

## Managed infrastructure

Deploy the same `apps/api/Dockerfile` and provide managed PostgreSQL 16+ and Redis 7+ URLs:

```dotenv
NODE_ENV=production
API_HOST=0.0.0.0
API_PORT=3000
APP_URL=https://authlane.example.com
BETTER_AUTH_URL=https://authlane.example.com
BETTER_AUTH_SECRET=<strong-random-secret>
DATABASE_URL=postgresql://...
REDIS_URL=rediss://...
ENCRYPTION_KEY=<64-hex-characters>
CORS_ORIGIN=https://authlane.example.com
```

The image runs as a non-root user and exposes `/health` for liveness and `/metrics` for Prometheus. Firewall `/metrics` or restrict it at the ingress.

## Operational requirements

- Keep `ENCRYPTION_KEY` in a secret manager. Rotating it requires re-encrypting stored credentials.
- Use separate database and encryption credentials per environment.
- Back up PostgreSQL and test restores. Redis can be rebuilt, but persistence prevents lost delayed refresh jobs.
- Keep the application role separate from the migration owner when enforcing PostgreSQL RLS in production.
- Run at least one always-on instance so delayed token refresh jobs are processed.
- Put a CDN or reverse proxy in front of static assets; hashed assets return one-year immutable cache headers.

## Performance acceptance

Warm the tenant/API-key/connection caches, allocate 2 vCPU and 1 GB memory, then run:

```bash
PERF_BASE_URL=https://authlane.example.com \
PERF_API_KEY=ak_... \
PERF_EXTERNAL_USER_ID=user_123 \
PERF_RPS=500 \
PERF_DURATION_SECONDS=20 \
PERF_P95_TARGET_MS=100 \
pnpm test:performance
```

The command exits non-zero for any request failure or P95 above the target. Track `authlane_http_request_duration_seconds`, cache hits/misses, event-loop lag, PostgreSQL latency, and Redis latency in production.

## Release checklist

- `pnpm install --frozen-lockfile`
- `pnpm type-check`
- `pnpm test`
- `pnpm build`
- `docker compose config`
- Build and scan the image
- Apply migrations against a staging database
- Run the hot-read benchmark
- Verify `/health`, dashboard login, connect flow, credential audit, and direct provider execution
