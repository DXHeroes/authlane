# API Keys Management

Manage API keys for programmatic access.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/dashboard/api-keys` | List API keys |
| POST | `/api/v1/dashboard/api-keys` | Create API key |
| DELETE | `/api/v1/dashboard/api-keys/:keyId` | Delete API key |
| PATCH | `/api/v1/dashboard/api-keys/:keyId` | Update API key |

## Authentication

- **Session**: Required (dashboard only)
- **API Key**: Not allowed (cannot manage keys via API key)

---

## List API Keys

### Request

```
GET /api/v1/dashboard/api-keys
```

### Response (200)

```json
{
  "data": {
    "items": [
      {
        "id": "key_abc123",
        "name": "Production API Key",
        "prefix": "ak_prod_",
        "lastUsed": "2024-12-12T10:30:00Z",
        "createdAt": "2024-11-01T00:00:00Z",
        "expiresAt": null,
        "scopes": ["connections:read", "connections:write", "tools:execute"],
        "environment": "production"
      },
      {
        "id": "key_def456",
        "name": "Development Key",
        "prefix": "ak_dev_",
        "lastUsed": "2024-12-11T15:00:00Z",
        "createdAt": "2024-12-01T00:00:00Z",
        "expiresAt": "2025-01-01T00:00:00Z",
        "scopes": ["connections:read", "tools:list"],
        "environment": "development"
      }
    ],
    "total": 2
  },
  "error": null
}
```

---

## Create API Key

### Request

```
POST /api/v1/dashboard/api-keys
```

### Request Body

```json
{
  "name": "Production API Key",
  "scopes": ["connections:read", "connections:write", "tools:execute"],
  "environment": "production",
  "expiresAt": null
}
```

### Response (201)

```json
{
  "data": {
    "id": "key_abc123",
    "name": "Production API Key",
    "key": "ak_prod_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "prefix": "ak_prod_",
    "scopes": ["connections:read", "connections:write", "tools:execute"],
    "environment": "production",
    "createdAt": "2024-12-12T10:30:00Z",
    "expiresAt": null
  },
  "error": null
}
```

> **Important**: The full API key is only returned once at creation. Store it securely.

---

## Delete API Key

### Request

```
DELETE /api/v1/dashboard/api-keys/:keyId
```

### Response (200)

```json
{
  "data": {
    "deleted": true,
    "keyId": "key_abc123"
  },
  "error": null
}
```

---

## Update API Key

### Request

```
PATCH /api/v1/dashboard/api-keys/:keyId
```

### Request Body

```json
{
  "name": "Updated Key Name",
  "scopes": ["connections:read"],
  "expiresAt": "2025-06-01T00:00:00Z"
}
```

### Response (200)

```json
{
  "data": {
    "id": "key_abc123",
    "name": "Updated Key Name",
    "scopes": ["connections:read"],
    "expiresAt": "2025-06-01T00:00:00Z",
    "updatedAt": "2024-12-12T10:30:00Z"
  },
  "error": null
}
```

---

## Examples

### cURL

```bash
# List API keys
curl -b "session=xxx" \
  "https://api.authlane.com/api/v1/dashboard/api-keys"

# Create API key
curl -X POST \
  -b "session=xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Key",
    "scopes": ["connections:read", "tools:execute"],
    "environment": "production"
  }' \
  "https://api.authlane.com/api/v1/dashboard/api-keys"

# Delete API key
curl -X DELETE \
  -b "session=xxx" \
  "https://api.authlane.com/api/v1/dashboard/api-keys/key_abc123"
```

### TypeScript SDK

```typescript
// List API keys
const { data: keys } = await authlane.dashboard.apiKeys.list();

// Create API key
const { data: newKey } = await authlane.dashboard.apiKeys.create({
  name: 'Production Key',
  scopes: ['connections:read', 'connections:write', 'tools:execute'],
  environment: 'production',
});

// IMPORTANT: Save the key immediately - it won't be shown again
console.log('New API Key:', newKey.key);

// Delete API key
await authlane.dashboard.apiKeys.delete({ keyId: 'key_abc123' });
```

### React Component

```tsx
function ApiKeysManager() {
  const [keys, setKeys] = useState([]);
  const [newKeyValue, setNewKeyValue] = useState(null);

  const createKey = async (name: string, scopes: string[]) => {
    const { data, error } = await authlane.dashboard.apiKeys.create({
      name,
      scopes,
      environment: 'production',
    });

    if (error) {
      showError(error.message);
      return;
    }

    // Show the key to user ONCE
    setNewKeyValue(data.key);
    refreshKeys();
  };

  const deleteKey = async (keyId: string) => {
    const confirmed = await confirm('Delete this API key? This cannot be undone.');
    if (!confirmed) return;

    await authlane.dashboard.apiKeys.delete({ keyId });
    refreshKeys();
  };

  return (
    <div>
      <h2>API Keys</h2>

      {newKeyValue && (
        <Alert variant="warning">
          <p>Save this key now - it won't be shown again:</p>
          <code>{newKeyValue}</code>
          <CopyButton value={newKeyValue} />
        </Alert>
      )}

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Prefix</th>
            <th>Scopes</th>
            <th>Last Used</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key.id}>
              <td>{key.name}</td>
              <td><code>{key.prefix}...</code></td>
              <td>{key.scopes.join(', ')}</td>
              <td>{formatDate(key.lastUsed)}</td>
              <td>
                <button onClick={() => deleteKey(key.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <CreateApiKeyForm onSubmit={createKey} />
    </div>
  );
}
```

## Available Scopes

| Scope | Description |
|-------|-------------|
| `connections:read` | List connections, get credentials |
| `connections:write` | Create, delete connections |
| `tools:list` | List available tools |
| `tools:execute` | Execute tools |
| `services:read` | List services |
| `users:read` | Read user data |
| `users:write` | Manage users |

## Key Prefixes

| Environment | Prefix | Purpose |
|-------------|--------|---------|
| Production | `ak_prod_` | Live application |
| Development | `ak_dev_` | Development/testing |
| Staging | `ak_stg_` | Staging environment |

## Security Considerations

- **Key Storage**: Keys are hashed (SHA-256) before storage
- **Key Display**: Full key shown only at creation
- **Rotation**: Regularly rotate keys, especially after team changes
- **Scopes**: Use minimum required scopes (principle of least privilege)
- **Expiration**: Set expiration for temporary keys

## Rate Limits

| Action | Limit |
|--------|-------|
| Create key | 10 per hour |
| List keys | 60 per minute |
| Delete key | 10 per hour |

## Notes

- Maximum 10 API keys per organization (free plan)
- Enterprise plans allow unlimited keys
- Deleted keys are soft-deleted for audit purposes
- Key usage is tracked for analytics

