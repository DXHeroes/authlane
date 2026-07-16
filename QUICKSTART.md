# Authlane quick start

Use this guide for local development only. Production deployments must follow
[Security operations](./docs/security/OPERATIONS.md) and [Deployment](./DEPLOYMENT.md).

## Prerequisites

- Node.js 22+
- pnpm 10.23.0
- Docker with Compose

## Start the development stack

```bash
pnpm install --frozen-lockfile
docker compose -f docker/docker-compose.yml up -d
cp .env.example .env
```

Generate three independent 32-byte keys and one independent Better Auth secret:

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
openssl rand -base64 48
```

Put those values in `.env` using versioned entries:

```dotenv
AUTHLANE_DATA_KEK_RING=data-v1:<64-hex-key>
AUTHLANE_LOOKUP_KEY_RING=lookup-v1:<64-hex-key>
AUTHLANE_REDIS_KEY_RING=redis-v1:<64-hex-key>
BETTER_AUTH_SECRETS=auth-v1:<random-secret-at-least-32-characters>
```

Never reuse a value between keyrings. `ENCRYPTION_KEY` is intentionally rejected.

```bash
pnpm --filter @authlane/database migrate
pnpm --filter @authlane/database seed
pnpm dev
```

The API is available at `http://localhost:3000`. The development dashboard and widget use Vite
origins configured in `.env`; production serves all browser surfaces from the Authlane origin.

## Verify the API

```bash
curl --fail http://localhost:3000/health
curl -H "Authorization: Bearer YOUR_SCOPED_API_KEY" \
  http://localhost:3000/api/v1/catalog/services
```

API keys belong only on a trusted server. A browser receives a short-lived connect URL created by a
backend with the `connect-sessions:create` scope. Provider access material is issued only through an
audited, non-cacheable server-side lease:

```typescript
const { data: lease, error } = await authlane.credentialLeases.create({
  externalUserId: 'user_123',
  serviceId: 'github',
});
```

The lease contains access-only material; OAuth refresh and ID tokens never leave Authlane. Do not
print a lease, API key, connect token, or provider response to logs.

See [README.md](./README.md), [SECURITY.md](./SECURITY.md), and the
[canonical OpenAPI document](./apps/docs/api-reference/openapi.yaml).
