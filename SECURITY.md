# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub private vulnerability reporting
for this repository. Include affected versions, reproduction steps, impact, and any suggested fix.
Do not include real customer credentials or tokens.

We will acknowledge a complete report as soon as maintainers are available, coordinate remediation,
and publish an advisory after affected users have a reasonable upgrade window. There is currently no
public bug-bounty program and no guaranteed response SLA.

## Supported versions

Until the first stable release, only the latest commit on `main` receives security fixes. Production
operators should pin an immutable commit or image digest and subscribe to repository advisories.

## Security model

Authlane is a control plane, not a provider-API proxy. Browser code receives only a short-lived,
origin-bound connect session. Scoped API keys and credential leases are server-to-server interfaces.
OAuth refresh and ID tokens are never returned by credential leases.

Secrets are stored with per-record AES-256-GCM data-encryption keys. Each DEK is wrapped by a
versioned key-encryption key kept outside PostgreSQL, and record identity, tenant, purpose, and format
version are authenticated as additional data. A PostgreSQL-only exfiltration therefore does not yield
usable plaintext provider tokens. This guarantee does not cover simultaneous compromise of the
database and the active keyring or a running process able to decrypt records.

See [security operations](./docs/security/OPERATIONS.md) for deployment, rotation, and incident steps.
