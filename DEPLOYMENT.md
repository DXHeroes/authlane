# Deployment

Authlane ships one production runtime for the dashboard, connect UI, authentication, OAuth callbacks,
and control-plane API. PostgreSQL, Redis, and the one-shot migrator remain separate security principals.

## Self-hosted Compose

```bash
cp .env.production.example .env
```

Fill every value without an insecure default. Generate independent secrets for every keyring, database
role, Redis, metrics, Grafana, and Better Auth. Keyring values use `version:value`, with the current
version first. Set exact public HTTPS origins and only the immediate trusted proxy CIDRs.

```bash
docker compose config --quiet
docker compose up --build -d
docker compose ps
curl --fail https://authlane.example.com/health
```

Only the application port is exposed. PostgreSQL and Redis stay on an internal network. Terminate TLS
at a maintained reverse proxy or load balancer; the Compose stack does not terminate TLS.

The migrator image owns schema changes, the idempotent 15-integration production catalog seed, and
role provisioning. It never creates users, organizations, accounts, or sample credentials. The API
runs as `authlane_app`; BullMQ jobs use `authlane_job`. The runtime image is non-root, read-only,
capability-free, and cannot migrate.

Optional Prometheus and Grafana:

```bash
docker compose --profile monitoring up -d
```

`/metrics` is undiscoverable without `METRICS_BEARER_TOKEN`; also restrict it at the network edge.

## Managed infrastructure

Deploy the `runner` target from `apps/api/Dockerfile`. Run the `migrator` target separately before
rollout, then provide managed PostgreSQL 16+ and Redis 7+ connections with encrypted transport.

Required production configuration includes:

- exact HTTPS `APP_URL`, `BETTER_AUTH_URL`, and `CORS_ORIGIN`;
- separate runtime and worker database URLs plus a migration owner URL;
- `AUTHLANE_DATA_KEK_RING`, `AUTHLANE_LOOKUP_KEY_RING`, and `AUTHLANE_REDIS_KEY_RING`;
- versioned `BETTER_AUTH_SECRETS` and an independent `METRICS_BEARER_TOKEN`;
- `TRUSTED_PROXY_CIDRS` only when traffic arrives through known proxies.

Never set the removed `ENCRYPTION_KEY`. Never put any populated `.env`, key file, provider token,
database dump, or backup key in the repository or container image.

## Coolify demo deployment

Deploy `docker-compose.coolify.yml` as one Git-backed Docker Compose Application. The `app` service is
the only public runtime; PostgreSQL, Redis, and the one-shot migrator have no host ports or domains.
Do not add custom Compose networks: Coolify attaches its proxy network to the public service.

For the DX Heroes demo use:

- repository `DXHeroes/authlane`, branch `main`, and compose path `/docker-compose.coolify.yml`;
- public app service domain `https://authlane.apps.dx.tools:3000`;
- `APP_URL`, `BETTER_AUTH_URL`, and `CORS_ORIGIN` set to `https://authlane.apps.dx.tools`;
- independent 64-hex values for database/Redis passwords, all three keyrings, Better Auth, and metrics;
- `RATE_LIMIT_MAX_REQUESTS=30000` and `RATE_LIMIT_WINDOW_MS=60000` for the acceptance benchmark;
- empty `TRUSTED_PROXY_CIDRS` unless the exact immediate Coolify proxy CIDR is known.

Create the resource with instant deployment disabled. Add the domain and masked runtime variables,
then deploy. A healthy deployment has an exited-zero `migrate` container, healthy PostgreSQL and
Redis, and a healthy `app` container responding on `/health`.

### First-owner bootstrap

1. Set `AUTHLANE_ALLOW_SIGNUP=true` and deploy.
2. Register the first owner in the browser; never send the password or TOTP seed through chat or logs.
3. Enable MFA, sign in again to obtain a fresh session, and create the initial organization settings.
4. Set `AUTHLANE_ALLOW_SIGNUP=false`, redeploy, and verify registration is rejected while sign-in works.

For GitHub OAuth create an app with homepage `https://authlane.apps.dx.tools` and callback
`https://authlane.apps.dx.tools/api/v1/oauth/github/callback`. Enter its client ID and secret only in
the Authlane dashboard. Roll back application code through Coolify deployment history; never perform
a destructive database rollback. This demo keeps data on local named volumes and does not provide a
production backup SLA. Move PostgreSQL and Redis to managed, backed-up services before production.

## Release gate

```bash
pnpm install --frozen-lockfile
pnpm lint:runtime
pnpm type-check
pnpm test
pnpm build
docker compose config --quiet
```

CI additionally runs OSV, dependency review, Gitleaks, CodeQL, and a Trivy container scan. Before
internet exposure, restore a backup in isolation, test dashboard MFA and OAuth flows, verify audit
events and provider revocation, and complete the checklist in
[Security operations](./docs/security/OPERATIONS.md).
