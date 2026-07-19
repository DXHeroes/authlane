# List connection statuses

Return an effective connection status for every enabled tenant service

**Endpoint:** `GET /api/v1/users/{externalUserId}/connections`

Returns an effective status for every enabled tenant service. Expiration is calculated at request time. Requires `connections:read`.
