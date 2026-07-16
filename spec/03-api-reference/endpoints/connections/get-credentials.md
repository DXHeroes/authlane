# Legacy credentials endpoint removed

`GET /api/v1/users/:userId/connections/:serviceId/credentials` is intentionally not implemented.
GET responses are cache-prone and the old contract exposed excessively durable credential material.

Server-side callers with the explicit `credentials:issue` scope must use:

```http
POST /api/v1/users/{externalUserId}/connections/{serviceId}/credential-leases
Authorization: ApiKey ak_live_...
Content-Type: application/json
```

The response is audited, marked `Cache-Control: no-store, private`, and never includes refresh tokens,
ID tokens, OAuth client secrets, or webhook secrets. Browser/session principals cannot use this route.
