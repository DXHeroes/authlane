# Gmail integration

Gmail follows the canonical Authlane integration contract:

- `integrations/gmail/config.yaml` declares OAuth endpoints and scopes.
- `integrations/gmail/tools.ts` exports immutable tool definitions and local handlers.
- `integrations/gmail/index.ts` exports the direct-execution adapter.

Authlane publishes Gmail definitions through `/api/v1/users/{externalUserId}/tools` and returns access-only credentials through the audited credential endpoint. The SaaS imports `@authlane/integration-gmail` and calls Gmail directly; provider traffic does not pass through Authlane.

See [`apps/docs/guides/custom-integrations.mdx`](../../apps/docs/guides/custom-integrations.mdx) for the maintained integration contract.
