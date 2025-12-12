# Dashboard Overview

The Authlane Dashboard provides a visual interface for managing your integrations.

## Accessing the Dashboard

- **Cloud**: https://app.authlane.com
- **Self-hosted**: http://localhost:3000 (default)

## Dashboard Sections

### Home / Overview

The main dashboard shows:

- **Connection Count**: Total active connections
- **Active Users**: Users with at least one connection
- **API Usage**: Request counts and trends
- **Recent Activity**: Latest connections and disconnections

### Services

Manage available services:

#### View Services

List of all configured services with:
- Service name and ID
- Auth type (OAuth2, API Key, etc.)
- Enable/disable toggle
- Connection count

#### Configure Service

For each service:
- **Custom OAuth App**: Use your own OAuth credentials
  - Client ID
  - Client Secret
  - Custom scopes
- **Enabled Scopes**: Select which scopes to request
- **Settings**: Service-specific settings

### Connections

Monitor user connections:

#### Connection List

- Filter by service, status, or user
- View connection details
- Check token expiration
- Manually refresh or revoke connections

#### Connection Details

- User ID
- Service
- Status (connected, expired, error)
- Connected at
- Expires at
- Scopes granted
- Metadata

### API Keys

Manage API keys:

#### Create API Key

1. Click "Create API Key"
2. Enter a name (e.g., "Production", "Development")
3. Select scopes:
   - `services:read` - Read service configurations
   - `connections:read` - Read connection data
   - `connections:write` - Create/delete connections
   - `tools:execute` - Execute tools
   - `admin:*` - Full admin access
4. Click "Create"
5. **Copy the key immediately** - it won't be shown again

#### Manage API Keys

- View active keys
- See last used timestamp
- Revoke keys

### Organization Settings

Configure your organization:

#### General

- Organization name
- Billing email
- Timezone

#### Members

- Invite team members
- Assign roles:
  - **Owner**: Full access
  - **Admin**: Manage settings and API keys
  - **Member**: View-only access
- Remove members

#### Billing (Cloud only)

- Current plan
- Usage statistics
- Upgrade/downgrade options
- Payment methods
- Invoice history

## Common Tasks

### Add a New Service

1. Go to **Services**
2. Click **Add Service**
3. Select from available services
4. Configure OAuth credentials (optional)
5. Enable required scopes
6. Click **Save**

### Monitor Connections

1. Go to **Connections**
2. Use filters to find specific connections
3. Click on a connection for details
4. Check status and expiration

### Rotate API Keys

1. Go to **API Keys**
2. Create a new key with same permissions
3. Update your application to use the new key
4. Revoke the old key

### Invite Team Members

1. Go to **Organization Settings** → **Members**
2. Click **Invite Member**
3. Enter email address
4. Select role
5. Click **Send Invite**

## Dashboard Security

### Authentication

The dashboard uses session-based authentication:
- Secure HTTP-only cookies
- CSRF protection
- Session expiration

### Two-Factor Authentication

Enable 2FA for additional security:
1. Go to **Account Settings**
2. Click **Enable 2FA**
3. Scan QR code with authenticator app
4. Enter verification code
5. Save backup codes

### Audit Logs (Scale+)

View activity logs:
- API key usage
- Configuration changes
- Member actions
- Connection events

## Mobile Access

The dashboard is responsive and works on mobile devices, but for the best experience, use a desktop browser for:
- Complex configurations
- Bulk operations
- Detailed analytics

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `g h` | Go to Home |
| `g s` | Go to Services |
| `g c` | Go to Connections |
| `g k` | Go to API Keys |
| `?` | Show shortcuts |

## Next Steps

- [Managing Services](./services.md)
- [API Keys Guide](./api-keys.md)
- [Team Management](./team.md)

