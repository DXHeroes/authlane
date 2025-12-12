# Reference Documentation

Complete reference materials for Authlane.

## Contents

- [Environment Variables](./environment-variables.md) - All configuration options
- [Error Codes](./error-codes.md) - Complete error code reference
- [Changelog](./changelog.md) - Version history

## Environment Variables

### Core Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `REDIS_URL` | Yes | - | Redis connection string |
| `ENCRYPTION_KEY` | Yes | - | 32-byte encryption key (base64) |
| `PORT` | No | 3000 | API server port |
| `NODE_ENV` | No | development | Environment mode |
| `LOG_LEVEL` | No | info | debug, info, warn, error |

### Security

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SESSION_SECRET` | No | random | Session encryption secret |
| `CORS_ORIGINS` | No | * | Allowed CORS origins |
| `RATE_LIMIT_MAX` | No | 100 | Max requests per minute |

### OAuth Providers

| Variable | Description |
|----------|-------------|
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret |
| `SLACK_CLIENT_ID` | Slack OAuth client ID |
| `SLACK_CLIENT_SECRET` | Slack OAuth client secret |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

## Error Codes

### Authentication Errors

| Code | HTTP | Description |
|------|------|-------------|
| `UNAUTHORIZED` | 401 | Authentication required |
| `INVALID_API_KEY` | 401 | API key not found or invalid |
| `API_KEY_EXPIRED` | 401 | API key has expired |
| `INSUFFICIENT_SCOPE` | 403 | API key lacks required scope |

### Connection Errors

| Code | HTTP | Description |
|------|------|-------------|
| `CONNECTION_NOT_FOUND` | 404 | Connection doesn't exist |
| `CONNECTION_EXPIRED` | 400 | Token expired, needs reconnect |
| `CONNECTION_REQUIRED` | 400 | Service not connected |

### OAuth Errors

| Code | HTTP | Description |
|------|------|-------------|
| `INVALID_STATE` | 400 | OAuth state invalid |
| `STATE_EXPIRED` | 400 | OAuth state expired |
| `TOKEN_EXCHANGE_FAILED` | 500 | Code exchange failed |

### Service Errors

| Code | HTTP | Description |
|------|------|-------------|
| `SERVICE_NOT_FOUND` | 404 | Service doesn't exist |
| `SERVICE_DISABLED` | 400 | Service is disabled |

### Tool Errors

| Code | HTTP | Description |
|------|------|-------------|
| `TOOL_NOT_FOUND` | 404 | Tool doesn't exist |
| `INVALID_PARAMETERS` | 400 | Tool parameters invalid |
| `PROVIDER_ERROR` | 502 | External API error |

### Rate Limiting

| Code | HTTP | Description |
|------|------|-------------|
| `RATE_LIMITED` | 429 | Too many requests |

## API Versions

| Version | Status | EOL |
|---------|--------|-----|
| v1 | Current | - |

## SDK Versions

| SDK | Version | API Compatibility |
|-----|---------|-------------------|
| TypeScript | 1.x | v1 |
| React | 1.x | v1 |
| MCP Server | 1.x | v1 |

## Changelog

### v1.0.0 (Upcoming)

- Initial stable release
- Core OAuth credential management
- GitHub, Slack, Google integrations
- TypeScript and React SDKs
- MCP Server for AI agents
- Dashboard for management

### v0.1.0 (Current)

- Beta release
- Basic OAuth flows
- GitHub integration
- API foundation

## Support Matrix

### Node.js

| Version | Support |
|---------|---------|
| 22.x | ✅ Supported |
| 20.x | ✅ Supported |
| 18.x | ✅ Supported |
| < 18 | ❌ Not supported |

### Databases

| Database | Version | Support |
|----------|---------|---------|
| PostgreSQL | 16+ | ✅ Full |
| PostgreSQL | 14-15 | ⚠️ Limited |
| PostgreSQL | < 14 | ❌ Not supported |

### Redis

| Version | Support |
|---------|---------|
| 7.x | ✅ Full |
| 6.x | ✅ Full |
| < 6 | ❌ Not supported |

## Links

- [GitHub Repository](https://github.com/authlane/authlane)
- [Documentation](https://docs.authlane.com)
- [Discord Community](https://discord.gg/authlane)
- [Issue Tracker](https://github.com/authlane/authlane/issues)

