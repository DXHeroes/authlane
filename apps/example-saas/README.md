# AI Assistant Hub - secure example SaaS

This example demonstrates the required backend-for-frontend boundary. The browser
calls only same-origin `/api/example/*` routes. The Authlane API key and all
provider credential leases stay inside the Node.js BFF.

## Complete local demo

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm demo
```

Open <http://localhost:5175/demo>. The **Connect local demo** action embeds
`@authlane/react`, completes a real S256-PKCE authorization flow against the local provider, and
then calls the provider through this app's BFF. The browser receives only sanitized demo resource
data and a token generation number; it never receives the Authlane API key, access token, refresh
token, OAuth client secret, or credential lease.

Generated admin credentials are stored in the root `.authlane-demo/access.json` with mode `0600`.
Run `pnpm demo:test` for the full no-skip Playwright acceptance test, `pnpm demo:down` to stop the
stack, or `pnpm demo:reset` to remove its volumes and generated secrets.

## Development

Set server-only environment variables and start the example:

```bash
AUTHLANE_API_KEY=ak_live_... \
AUTHLANE_API_URL=http://localhost:3000 \
EXAMPLE_BROWSER_ORIGIN=http://localhost:5174 \
pnpm --filter example-saas dev
```

The Vite browser app runs on port 5174 and proxies its BFF calls to port 5175.
For a production build, run `pnpm --filter example-saas build` and then
`pnpm --filter example-saas start` with the same server-only environment.

## Security boundary

```text
Browser ── same-origin request ──▶ Example SaaS BFF
                                      │
                                      ├── scoped API key ──▶ Authlane
                                      └── credential lease ──▶ GitHub
Browser ◀──── sanitized application data only ───────────────┘
```

- `AUTHLANE_API_KEY` is read only by `server/index.ts`; no Vite environment
  variable contains it.
- Mutating BFF requests require an exact `Origin` match.
- The GitHub provider URL is fixed, credential responses are non-cacheable, and
  only an allowlisted repository shape is returned to the browser.
- Refresh tokens, ID tokens, access tokens, and API keys are never rendered or
  returned by the BFF.
- The deterministic local OAuth provider is enabled only by an explicit demo
  flag and refuses to mount in production.

The hardcoded `demo_user_123` represents the user ID your real authenticated
backend would resolve from its own session. Do not accept this identifier from
browser input in a production application.
