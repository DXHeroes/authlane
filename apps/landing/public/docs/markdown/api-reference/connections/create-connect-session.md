# Create connect session

Create a short-lived browser handoff bound to one user, service allowlist, and exact HTTPS origin

**Endpoint:** `POST /api/v1/connect-sessions`

Creates a 60–900 second browser handoff bound to an external user, service allowlist, and exact HTTPS parent origin. Requires `connect-sessions:create`.

The returned URL carries the opaque handoff token in its URL fragment, so it is not sent in HTTP request targets or referrers. Responses are non-cacheable. Disconnect is disabled by default; after reauthenticating the end-user in your own application, set `reauthenticatedAt` to the current UTC timestamp to grant that single connect session a five-minute destructive-action window.

`allowedServices` is required. Pass explicit service IDs to restrict the handoff, or pass `[]` to snapshot every service currently enabled globally and for the organization. Authlane stores the resolved IDs, never a wildcard. If no services are enabled, session creation fails with `400 VALIDATION_ERROR`. Services enabled after creation are not added; services disabled after creation are hidden and cannot begin a new authorization, while disconnect remains available for existing access.
