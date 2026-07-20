# API overview

Use the scoped Authlane control-plane API and open the complete read-only OpenAPI reference.

All API responses use `{ data, error }`. SaaS endpoints accept a scoped, server-only tenant key:

```http
Authorization: Bearer ak_...
```

Catalog, connection, capability, and tool-definition endpoints are control-plane requests.
Credential leases are audited, access-only, and non-cacheable. There is no tool-execution endpoint.

Use the **Full OpenAPI reference** navigation tab as the final canonical source for operations,
parameters, bodies, responses, schemas, security requirements, and same-origin YAML/JSON downloads.
It is read-only and does not accept or persist credentials.

The canonical source is the repository-owned
The OpenAPI 3.1 document is available at `https://authlane.io/docs/openapi.yaml` and the
[interactive API reference](https://authlane.io/docs/api-reference) renders the same source.

Start with [authentication and scopes](/docs/api-reference/authentication), then handle
[errors and rate limits](/docs/api-reference/errors-and-rate-limits).
