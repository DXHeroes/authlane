# Self-Hosting Guide

Run the hardened Authlane control plane

Authlane uses an application container, a one-shot migration container, PostgreSQL 16, and Redis 7.
The application serves the dashboard, connect UI, API, OAuth callbacks, and background workers.

## Docker Compose

```bash
cp .env.example .env
openssl rand -hex 32
```

Fill every required value in `.env` with an independent random value. `APP_URL`,
`BETTER_AUTH_URL`, and every CORS origin must be exact HTTPS origins in production. Keyrings use
`key-id:64-hex-key` entries with the current key first. Better Auth uses
`version:secret` entries with the current version first.

```bash
docker compose up --build -d
curl --fail http://127.0.0.1:3000/health
```

The migration container uses the database owner, then exits. API traffic uses an RLS-enforced role;
background jobs use a separate narrowly granted role. PostgreSQL and Redis are confined to an
internal network and Redis requires authentication. Terminate TLS in a maintained reverse proxy.

## Monitoring

```bash
docker compose --profile monitoring up -d
```

Prometheus authenticates to `/metrics` using `METRICS_BEARER_TOKEN`. Grafana binds only to
`127.0.0.1` by default. Do not expose either service without a separate authenticated ingress.

## Managed PostgreSQL and Redis

Use separate migration, runtime, and worker database roles. Configure `DATABASE_URL` for the
NOBYPASSRLS runtime role and `SYSTEM_DATABASE_URL` for the worker. Use TLS-enabled `postgresql://`
and `rediss://` connections whenever traffic leaves a private host network.

The final image uses Node.js 22, pnpm 10, a non-root user, a read-only root filesystem, dropped Linux
capabilities, and no migration privileges.

Follow the [security operations runbook](/docs/guides/security-operations) for launch checks and key rotation.
