# OAuth callback

Validate OAuth state and PKCE, store encrypted credentials, and return to the hosted connect UI

**Endpoint:** `GET /api/v1/oauth/{serviceId}/callback`

Validates the one-time state and PKCE verifier, stores encrypted credentials, schedules refresh, writes a connection event, and returns to the hosted connect UI.
