# Organization Settings

Manage organization-level settings.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/dashboard/organization` | Get organization details |
| PATCH | `/api/v1/dashboard/organization` | Update organization settings |
| DELETE | `/api/v1/dashboard/organization` | Delete organization |

## Authentication

- **Session**: Required (dashboard only)
- **Role**: Organization admin required for modifications

---

## Get Organization

Retrieve organization details and settings.

### Request

```
GET /api/v1/dashboard/organization
```

### Response (200)

```json
{
  "data": {
    "id": "org_abc123",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "logo": "https://cdn.authlane.com/logos/acme.png",
    "settings": {
      "oauthRedirectUrls": {
        "success": "https://app.acme.com/oauth/success",
        "error": "https://app.acme.com/oauth/error"
      },
      "webhookUrl": "https://app.acme.com/webhooks/authlane",
      "webhookSecret": "whsec_••••••••",
      "allowedDomains": ["acme.com", "acme.io"],
      "defaultConnectionScope": "user",
      "requireMfa": false
    },
    "plan": {
      "name": "Pro",
      "limits": {
        "users": 1000,
        "connections": 10000,
        "apiKeys": 25,
        "services": "unlimited"
      },
      "features": ["custom_oauth", "webhooks", "audit_logs"]
    },
    "usage": {
      "users": 142,
      "connections": 380,
      "apiKeys": 4
    },
    "createdAt": "2024-01-15T00:00:00Z",
    "updatedAt": "2024-12-10T14:00:00Z"
  },
  "error": null
}
```

---

## Update Organization

Update organization settings.

### Request

```
PATCH /api/v1/dashboard/organization
```

### Request Body

```json
{
  "name": "Acme Corporation",
  "logo": "https://cdn.acme.com/logo.png",
  "settings": {
    "oauthRedirectUrls": {
      "success": "https://app.acme.com/oauth/success",
      "error": "https://app.acme.com/oauth/error"
    },
    "webhookUrl": "https://app.acme.com/webhooks/authlane",
    "allowedDomains": ["acme.com", "acme.io", "acme.dev"]
  }
}
```

### Response (200)

```json
{
  "data": {
    "id": "org_abc123",
    "name": "Acme Corporation",
    "updated": true,
    "updatedAt": "2024-12-12T10:30:00Z"
  },
  "error": null
}
```

---

## Delete Organization

Permanently delete an organization and all associated data.

### Request

```
DELETE /api/v1/dashboard/organization
```

### Request Body

```json
{
  "confirmName": "acme-corp",
  "reason": "Switching providers"
}
```

### Response (200)

```json
{
  "data": {
    "deleted": true,
    "organizationId": "org_abc123",
    "deletedAt": "2024-12-12T10:30:00Z"
  },
  "error": null
}
```

---

## Examples

### cURL

```bash
# Get organization
curl -b "session=xxx" \
  "https://api.authlane.com/api/v1/dashboard/organization"

# Update organization
curl -X PATCH \
  -b "session=xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corporation",
    "settings": {
      "webhookUrl": "https://app.acme.com/webhooks"
    }
  }' \
  "https://api.authlane.com/api/v1/dashboard/organization"

# Delete organization
curl -X DELETE \
  -b "session=xxx" \
  -H "Content-Type: application/json" \
  -d '{"confirmName": "acme-corp"}' \
  "https://api.authlane.com/api/v1/dashboard/organization"
```

### TypeScript SDK

```typescript
// Get organization
const { data: org } = await authlane.dashboard.organization.get();

// Update organization
const { data: updated } = await authlane.dashboard.organization.update({
  name: 'Acme Corporation',
  settings: {
    webhookUrl: 'https://app.acme.com/webhooks',
    allowedDomains: ['acme.com', 'acme.io'],
  },
});

// Delete organization (DANGEROUS!)
const { error } = await authlane.dashboard.organization.delete({
  confirmName: org.slug, // Must match exactly
  reason: 'Switching providers',
});
```

### React Settings Page

```tsx
function OrganizationSettings() {
  const { data: org, refetch } = useQuery(['org'], () =>
    authlane.dashboard.organization.get()
  );

  const updateSettings = async (values: OrgSettingsForm) => {
    const { error } = await authlane.dashboard.organization.update(values);

    if (error) {
      showError(error.message);
      return;
    }

    showSuccess('Settings updated');
    refetch();
  };

  return (
    <div className="space-y-8">
      <section>
        <h2>General</h2>
        <form onSubmit={handleSubmit(updateSettings)}>
          <Input label="Organization Name" {...register('name')} />
          <Input label="Logo URL" {...register('logo')} />
          <Button type="submit">Save</Button>
        </form>
      </section>

      <section>
        <h2>OAuth Configuration</h2>
        <Input
          label="Success Redirect URL"
          {...register('settings.oauthRedirectUrls.success')}
        />
        <Input
          label="Error Redirect URL"
          {...register('settings.oauthRedirectUrls.error')}
        />
      </section>

      <section>
        <h2>Webhooks</h2>
        <Input
          label="Webhook URL"
          {...register('settings.webhookUrl')}
        />
        <WebhookSecretDisplay secret={org?.settings.webhookSecret} />
        <Button onClick={regenerateWebhookSecret}>
          Regenerate Secret
        </Button>
      </section>

      <section>
        <h2>Plan & Usage</h2>
        <PlanCard plan={org?.plan} />
        <UsageMeters usage={org?.usage} limits={org?.plan.limits} />
      </section>

      <DangerZone>
        <h3>Delete Organization</h3>
        <p>This action cannot be undone. All data will be permanently deleted.</p>
        <DeleteOrgButton org={org} />
      </DangerZone>
    </div>
  );
}
```

## Settings Reference

### OAuth Redirect URLs

| Field | Description |
|-------|-------------|
| `success` | URL to redirect after successful OAuth |
| `error` | URL to redirect after failed OAuth |

Both URLs must be HTTPS in production and must be on an allowed domain.

### Webhooks

| Field | Description |
|-------|-------------|
| `webhookUrl` | URL to receive webhook events |
| `webhookSecret` | Secret for validating webhook signatures |

### Security Settings

| Field | Description |
|-------|-------------|
| `allowedDomains` | Domains allowed for redirect URLs |
| `defaultConnectionScope` | Default scope: "user" or "organization" |
| `requireMfa` | Require MFA for dashboard access (Enterprise) |

## Plan Limits

### Free Plan

| Resource | Limit |
|----------|-------|
| Users | 100 |
| Connections | 500 |
| API Keys | 3 |
| Services | 5 |

### Pro Plan

| Resource | Limit |
|----------|-------|
| Users | 1,000 |
| Connections | 10,000 |
| API Keys | 25 |
| Services | Unlimited |

### Enterprise Plan

| Resource | Limit |
|----------|-------|
| Users | Unlimited |
| Connections | Unlimited |
| API Keys | Unlimited |
| Services | Unlimited |

## Webhook Events

When webhooks are configured, Authlane sends POST requests for:

| Event | Description |
|-------|-------------|
| `connection.created` | New connection established |
| `connection.deleted` | Connection removed |
| `connection.expired` | Connection expired |
| `tool.executed` | Tool execution completed |

### Webhook Payload

```json
{
  "event": "connection.created",
  "timestamp": "2024-12-12T10:30:00Z",
  "data": {
    "connectionId": "conn_abc123",
    "userId": "user_456",
    "serviceId": "github"
  },
  "signature": "sha256=..."
}
```

### Validating Webhooks

```typescript
import { createHmac } from 'crypto';

function validateWebhook(payload: string, signature: string, secret: string): boolean {
  const expected = 'sha256=' + createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return signature === expected;
}
```

## Deleting Organization

⚠️ **This action is permanent and cannot be undone.**

When an organization is deleted:

1. All user data is removed
2. All connections are revoked (tokens invalidated at providers)
3. All API keys are invalidated
4. All encrypted credentials are destroyed
5. Audit logs are retained for 90 days (compliance)

### Requirements

- Must be organization owner
- Must confirm by typing organization slug
- Active subscriptions are cancelled
- Data export available before deletion

## Notes

- Slug cannot be changed after creation
- Logo must be hosted on HTTPS
- Webhook URLs are validated on save
- Settings changes are audit-logged

