# Managing Services

Configure and manage services in the Authlane dashboard.

## Service Configuration

### Built-in Services

Authlane includes pre-configured services:
- GitHub
- Slack
- Google (Calendar, Drive, Gmail)
- Notion
- Linear
- Jira
- And more...

These work out-of-the-box with Authlane's shared OAuth apps.

### Using Custom OAuth Apps

For production use, you should use your own OAuth apps:

1. **Go to Services** in the dashboard
2. **Select a service** (e.g., GitHub)
3. **Click "Configure"**
4. **Enter your credentials**:
   - Client ID
   - Client Secret
5. **Save**

Benefits of custom OAuth apps:
- Your branding shown during OAuth
- Higher rate limits
- Better user trust
- Required for production use

## Enabling/Disabling Services

### Enable a Service

1. Go to **Services**
2. Find the service
3. Toggle **Enabled** to on
4. Configure if needed

### Disable a Service

1. Go to **Services**
2. Find the service
3. Toggle **Enabled** to off

When disabled:
- New connections cannot be created
- Existing connections continue to work
- Users see the service as unavailable

## Scope Management

### Understanding Scopes

Scopes define what access level is requested:

```
github:
  - repo           # Full repository access
  - repo:status    # Commit status only
  - user:email     # Email only
```

### Configuring Scopes

1. Go to **Services** → select service
2. Click **Scopes**
3. Select which scopes to offer:
   - **Required**: Always requested
   - **Optional**: User can grant or deny
   - **Disabled**: Never requested

### Scope Groups

Some services group related scopes:

```
Google Calendar:
  ├── Read Only
  │   └── calendar.readonly
  │   └── calendar.events.readonly
  └── Full Access
      └── calendar
      └── calendar.events
```

## Service Settings

### General Settings

| Setting | Description |
|---------|-------------|
| Display Name | Name shown to users |
| Description | Service description |
| Icon URL | Custom icon (optional) |
| Enabled | Service availability |

### OAuth Settings

| Setting | Description |
|---------|-------------|
| Client ID | OAuth app client ID |
| Client Secret | OAuth app client secret |
| Authorization URL | Custom auth URL (advanced) |
| Token URL | Custom token URL (advanced) |
| Scopes | Enabled scopes |

### Advanced Settings

| Setting | Description |
|---------|-------------|
| Token Refresh | Auto-refresh before expiry |
| Retry Policy | Retry on failures |
| Rate Limiting | Per-user rate limits |

## Service Health

### Monitoring

The dashboard shows service health:
- **Healthy**: All systems operational
- **Degraded**: Some issues detected
- **Down**: Service unavailable

### Health Checks

Authlane periodically checks:
- OAuth endpoint availability
- Token refresh functionality
- API responsiveness

### Alerts

Configure alerts for:
- Service outages
- High error rates
- Token refresh failures

## Per-Organization Services

Each organization can have custom service configurations:

### Organization Override

1. Go to **Organization Settings** → **Services**
2. Select a service
3. Toggle **Use Custom Configuration**
4. Enter organization-specific settings

### Use Cases

- Different OAuth apps per environment
- Custom scopes per organization
- White-label service names

## Adding Custom Services

For services not in the catalog:

### Via Dashboard

1. Go to **Services** → **Add Custom Service**
2. Fill in:
   - Service ID (unique identifier)
   - Service Name
   - Auth Type (oauth2, api_key, header)
   - OAuth URLs (if OAuth)
   - Scopes
3. Test the configuration
4. Save

### Via API

```typescript
await authlane.services.create({
  id: 'custom-service',
  name: 'Custom Service',
  authType: 'oauth2',
  config: {
    authorizationUrl: 'https://service.com/oauth/authorize',
    tokenUrl: 'https://service.com/oauth/token',
    scopes: ['read', 'write'],
  },
});
```

## Troubleshooting

### Common Issues

#### "Invalid redirect URI"

Your OAuth app's redirect URI doesn't match Authlane's callback URL.

**Solution**: Add `https://your-domain.com/api/v1/oauth/callback/{service-id}` to your OAuth app's allowed redirect URIs.

#### "Invalid client credentials"

Client ID or secret is incorrect.

**Solution**: Double-check the credentials in the dashboard.

#### "Scope not available"

Requested scope isn't enabled for the OAuth app.

**Solution**: Enable the scope in both:
1. Your OAuth app settings
2. Authlane service configuration

## Best Practices

1. **Use Custom OAuth Apps** for production
2. **Request Minimal Scopes** - only what you need
3. **Monitor Health** - set up alerts
4. **Review Periodically** - disable unused services
5. **Document** - note why specific scopes are needed

## Next Steps

- [API Keys Guide](./api-keys.md)
- [Integration Documentation](../../06-integrations/index.md)
- [Troubleshooting](../troubleshooting/common-issues.md)

