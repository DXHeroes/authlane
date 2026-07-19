# API Reference

Authlane control-plane endpoints

All API responses use `{ data, error }`. SaaS endpoints require a scoped key:

```http
Authorization: Bearer ak_...
```

The capability, connection, tool, and catalog endpoints are read-only control-plane requests. There is intentionally no tool execution endpoint.

See the bundled [OpenAPI specification](https://github.com/authlane/authlane/blob/main/apps/docs/api-reference/openapi.yaml) for schemas and scopes.
