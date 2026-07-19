# Security operations

## Production launch gate

Before exposing Authlane to the internet:

- terminate TLS at a maintained reverse proxy and redirect HTTP to HTTPS;
- set exact HTTPS `APP_URL`, `BETTER_AUTH_URL`, and `CORS_ORIGIN` values;
- keep the three keyrings and Better Auth secret ring in a secret manager, outside PostgreSQL;
- use independent random values for every key, database role, Redis, metrics, and Grafana secret;
- configure `TRUSTED_PROXY_CIDRS` only for the immediate proxies you operate;
- run migrations with the migrator role, API traffic with `authlane_app`, and jobs with `authlane_job`;
- keep PostgreSQL and Redis off public networks and enable encrypted transport when they leave the host;
- require fresh passwordless sessions or dashboard MFA according to `AUTHLANE_AUTH_MODE`, retain
  audit logs, and alert on repeated auth failures, refresh failures, and credential-lease issuance
  anomalies;
- verify backups by restoring into an isolated environment, and protect backups with a separate key;
- require CI tests, CodeQL, OSV, dependency review, secret scanning, and container scanning.

The Compose file provides process isolation and private data networks, but it does not terminate TLS.
Do not use development HTTP origins or the development infrastructure compose file in production.

## Single-runtime public surfaces

Route both `authlane.io` and `app.authlane.io` to the same container and preserve the direct `Host`
header. The one Node process serves the static landing, documentation entry, dashboard, connect widget,
and API from these exact production roots and hosts:

```dotenv
AUTHLANE_PUBLIC_DIR=/app/public-product
AUTHLANE_LANDING_DIR=/app/public-landing
AUTHLANE_LANDING_HOSTS=authlane.io
AUTHLANE_APP_HOSTS=app.authlane.io
APP_URL=https://app.authlane.io
BETTER_AUTH_URL=https://app.authlane.io
CORS_ORIGIN=https://app.authlane.io
AUTHLANE_AUTH_MODE=magic-link
AUTHLANE_ALLOW_SIGNUP=false
RESEND_API_KEY=<runtime-only secret>
EMAIL_FROM=Authlane <auth@mail.authlane.io>
```

The image contains only public build artifacts. Supply `DATABASE_URL`, `SYSTEM_DATABASE_URL`,
`REDIS_URL`, all three keyrings, `BETTER_AUTH_SECRETS`, and operational tokens at runtime through the
deployment secret manager; never bake them into the image.

The apex host serves only the landing allowlist. Product, API, connect, and documentation routes are
available only on the app host, where `/docs` is read from `/app/public-landing/docs`. Unknown hosts
fail closed, and `X-Forwarded-Host` does not select a surface. `/health` remains host-independent for
container and load-balancer checks.

`AUTHLANE_ALLOW_SIGNUP=false` remains the self-hosted production default. Authlane Cloud may keep it
enabled intentionally. Production magic-link mode requires a verified sender and runtime-only Resend
key, and fails closed when either mail setting is absent.

## Key rotation

Keyring order is significant: the first entry is used for new writes, while later entries decrypt old
records during a staged rotation. Never remove an old key until every dependent record has moved away
from it and a tested backup exists.

### Data KEK

1. Add a new independent key first in `AUTHLANE_DATA_KEK_RING`, retaining the previous key.
2. Restart API and workers, then run `pnpm --filter @authlane/database secrets:rewrap` with the isolated
   `SYSTEM_DATABASE_URL`. This rewraps only per-record DEKs; provider token ciphertext is unchanged.
3. Confirm no `secret_records.key_id` rows reference the old key and exercise OAuth callback, refresh,
   webhook, and credential-lease flows.
4. Remove the old KEK from the secret manager, restart, and monitor decryption failures.

### Lookup key

Add the new lookup key first. Existing API-key hashes name their old key version and remain verifiable
while that key stays in the ring. Issue replacement API keys, update consumers, revoke the old keys,
then remove the old lookup key. Raw API keys cannot be rehashed because Authlane does not retain them.

### Redis and Better Auth keys

Add new keys first and retain old keys longer than the maximum Redis value/session/token lifetime.
Restart every replica before removing old versions. Removing an old auth secret intentionally
invalidates artifacts signed with it.

## Suspected compromise

1. Preserve logs and snapshots; restrict access before changing evidence-bearing systems.
2. Determine whether the incident affected PostgreSQL only, key storage, runtime memory, API keys,
   sessions, OAuth client secrets, or provider tokens.
3. If key material or runtime decryption was exposed, revoke provider grants and OAuth client secrets;
   rotating only the Authlane KEK is not sufficient.
4. Revoke Authlane API keys and sessions, rotate Better Auth/lookup/Redis/data keys, and rewrap records.
5. Rebuild from a reviewed commit and clean infrastructure; do not trust an in-place compromised host.
6. Notify affected operators and users according to applicable law and publish a security advisory.

Database-only theft does not reveal plaintext under the envelope model, but ciphertext should still be
treated as sensitive and retained old provider grants should be reviewed based on incident scope.
