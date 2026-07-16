# AI Assistant Hub - secure example SaaS

This example demonstrates the required backend-for-frontend boundary. The browser
calls only same-origin `/api/example/*` routes. The Authlane API key and all
provider credential leases stay inside the Node.js BFF.

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

The hardcoded `demo_user_123` represents the user ID your real authenticated
backend would resolve from its own session. Do not accept this identifier from
browser input in a production application.
