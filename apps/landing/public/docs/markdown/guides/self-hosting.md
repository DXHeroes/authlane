# Self-hosting

Run Authlane as one hardened application with PostgreSQL and Redis.

The application container serves the dashboard, hosted connect UI, API, OAuth callbacks, and
background workers. A one-shot migration container prepares PostgreSQL.

## Prerequisites

Use Node.js 22-compatible images, PostgreSQL 16, Redis 7, a maintained TLS ingress, and independent
random values for every secret and keyring.

## Implement the workflow

```bash
cp .env.example .env
openssl rand -hex 32
docker compose up --build -d
curl --fail http://127.0.0.1:3000/health
```

Set `APP_URL`, `BETTER_AUTH_URL`, and CORS values to exact public HTTPS origins. Keyring entries use
`key-id:64-hex-key` with the current key first; Better Auth entries use `version:secret` with the
current version first.

Use `DATABASE_URL` for the NOBYPASSRLS application role and `SYSTEM_DATABASE_URL` for the narrowly
granted worker. Keep PostgreSQL and Redis on private networks and require TLS when traffic leaves a
private host.

Optional local monitoring starts with:

```bash
docker compose --profile monitoring up -d
```

Prometheus authenticates to `/metrics` with `METRICS_BEARER_TOKEN`; Grafana binds to `127.0.0.1` by
default.

## Expected result

The migration container exits successfully and one non-root Authlane runtime serves every product
surface. PostgreSQL and Redis are not public.

## Handle errors

Check migration-role permissions, RLS runtime grants, Redis authentication, exact origin values,
and retained keyring versions before changing application code.

## Security boundary

Terminate TLS at a maintained ingress, keep the final root filesystem read-only, drop Linux
capabilities, and never give the runtime migration privileges.

## Next step

Complete [security operations](/docs/guides/security-operations) and run the
[performance benchmark](/docs/guides/performance).
