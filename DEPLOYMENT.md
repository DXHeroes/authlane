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

The migrator image owns schema changes and role provisioning. The API runs as `authlane_app`; BullMQ
jobs use `authlane_job`. The runtime image is non-root, read-only, capability-free, and cannot migrate.

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
