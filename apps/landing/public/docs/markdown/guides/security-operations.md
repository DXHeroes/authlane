# Security Operations

Production launch, key rotation, and incident response

## Launch gate

- Terminate TLS and use exact HTTPS application, auth, and CORS origins.
- Store all versioned keyrings outside PostgreSQL and use independent random values.
- Separate migration, RLS runtime, and worker database roles.
- Keep PostgreSQL and Redis private; use encrypted transport when traffic leaves the host.
- Configure trusted proxy CIDRs explicitly, require dashboard MFA, and protect `/metrics`.
- Restore a backup in isolation and require every security CI job before release.

## Rotate the data KEK

Add a new first entry to `AUTHLANE_DATA_KEK_RING` while retaining the old entry. Restart every replica,
then run:

```bash
pnpm --filter @authlane/database secrets:rewrap
```

The command requires `SYSTEM_DATABASE_URL` and rewraps only per-record DEKs. After confirming no
`secret_records.key_id` rows use the old version and testing OAuth/refresh/lease flows, remove the old
key and restart again.

Lookup-key rotation requires replacing and revoking API keys because Authlane cannot rehash raw keys it
does not retain. Retain old Redis/auth keys longer than the maximum artifact lifetime.

## Incident response

Contain access and preserve evidence. Determine whether PostgreSQL alone, key storage, runtime memory,
API keys, sessions, or provider grants were exposed. If decryption capability may have leaked, revoke
provider grants and OAuth client secrets; KEK rotation alone is insufficient. Revoke Authlane keys and
sessions, rotate every affected keyring, rebuild clean infrastructure, notify affected operators, and
publish an advisory when appropriate.
