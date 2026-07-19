# Key rotation and security operations

Launch, rotate keyrings, restore safely, and respond to Authlane security incidents.

Use this runbook for production launch and any event that may expose database, key storage, runtime
memory, tenant keys, sessions, or provider grants.

## Prerequisites

Keep PostgreSQL, Redis, backups, and every versioned keyring access-controlled. Separate migration,
RLS runtime, and worker database roles.

## Implement the workflow

Before launch, require exact HTTPS application/auth/CORS origins, explicit trusted proxy CIDRs,
dashboard MFA, an authenticated `/metrics` route, private data services, and a tested isolated
restore.

Rotate the data KEK by adding a new first entry to `AUTHLANE_DATA_KEK_RING` while retaining the old
entry. Restart every replica, then rewrap only the per-record DEKs:

```bash
pnpm --filter @authlane/database secrets:rewrap
```

The command requires `SYSTEM_DATABASE_URL`. Confirm no `secret_records.key_id` rows use the old key
and test OAuth, refresh, and credential-lease flows before removing it. Lookup-key rotation requires
replacing and revoking API keys because raw keys are not retained.

## Expected result

Every live record references a retained key version, old keys can be retired deliberately, and a
restore proves the database plus retained keyrings are usable together.

## Handle errors

If decryption capability may have leaked, revoke provider grants and OAuth client secrets; KEK
rotation alone is insufficient. Revoke Authlane keys and sessions, rebuild clean infrastructure,
preserve evidence, and notify affected operators.

## Security boundary

Store backups and keyrings separately. Losing every retained data KEK makes stored credentials
unrecoverable; storing them with the database defeats the database-leak boundary.

## Next step

Benchmark and monitor the [capabilities hot read](/docs/guides/performance).
