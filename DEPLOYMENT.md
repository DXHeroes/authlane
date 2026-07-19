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
- both public service domains on the same `app` service: `https://authlane.io:3000` and
  `https://app.authlane.io:3000`;
- `APP_URL=https://app.authlane.io`, `BETTER_AUTH_URL=https://app.authlane.io`, and
  `CORS_ORIGIN=https://app.authlane.io` plus only explicitly required tenant origins;
- `AUTHLANE_LANDING_HOSTS=authlane.io`, `AUTHLANE_APP_HOSTS=app.authlane.io`, and
  `AUTHLANE_AUTH_MODE=magic-link`, `AUTHLANE_ALLOW_SIGNUP=true`;
- a new masked, runtime-only `RESEND_API_KEY` and
  `EMAIL_FROM=Authlane <auth@mail.authlane.io>` after Resend verifies DKIM and SPF for
  `mail.authlane.io`;
- independent URL-safe 64-hex database/Redis passwords, `v1:<64-hex>` keyrings,
  `1:<64-hex>` Better Auth secrets, and a 64-hex metrics token;
- `RATE_LIMIT_MAX_REQUESTS=30000` and `RATE_LIMIT_WINDOW_MS=60000` for the acceptance benchmark;
- empty `TRUSTED_PROXY_CIDRS` unless the exact immediate Coolify proxy CIDR is known.

Create the resource with instant deployment disabled. Add the domain and masked, literal,
runtime-only variables, then deploy. The Compose file deliberately resolves secrets only when the
containers start so Coolify does not inject them into build arguments or image metadata. A healthy
deployment has an exited-zero `migrate` container, healthy PostgreSQL and Redis, and a healthy `app`
container responding on `/health`.

The apex host serves only the public landing. Dashboard, authentication, docs, connect, and API
routes are served only from `app.authlane.io`. No gateway, MCP, provider proxy, or tool-execution
service belongs in this stack; SaaS runtimes call providers directly.

### First-owner bootstrap

1. Verify Resend DNS, revoke any disclosed sending key, and create a new sending-only key.
2. Set the four passwordless variables above and deploy.
3. Request a link in the browser, complete onboarding, and verify the organization is active.
4. Keep sign-up open for Authlane Cloud, or set `AUTHLANE_ALLOW_SIGNUP=false` for a closed
   self-hosted installation. Existing users can still request links when sign-up is closed.

For GitHub OAuth create an app with homepage `https://app.authlane.io` and callback
`https://app.authlane.io/api/v1/oauth/github/callback`. Enter its client ID and secret only in
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
