# Rate Limiting

Authlane implements rate limiting to ensure fair usage and protect against abuse.

## Rate Limit Tiers

| Plan | Requests/Minute | Requests/Hour | Requests/Day |
|------|-----------------|---------------|--------------|
| Free | 100 | 1,000 | 10,000 |
| Pro | 500 | 10,000 | 100,000 |
| Scale | 2,000 | 50,000 | 500,000 |
| Enterprise | Custom | Custom | Custom |

## Rate Limit Headers

All responses include rate limit information:

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1702459200
```

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests in current window |
| `X-RateLimit-Remaining` | Remaining requests in current window |
| `X-RateLimit-Reset` | Unix timestamp when window resets |

## Rate Limit Keys

Rate limits are applied in this priority order:

1. **Organization** - If request has organization context
2. **User** - If request has user context
3. **API Key** - If request uses API key
4. **IP Address** - Fallback for unauthenticated requests

```typescript
function getRateLimitKey(context: RequestContext): string {
  if (context.organization) return `org:${context.organization.id}`;
  if (context.user) return `user:${context.user.id}`;
  if (context.apiKey) return `apikey:${context.apiKey.substring(0, 10)}`;
  return `ip:${context.ip}`;
}
```

## Rate Limited Response

When rate limited, you'll receive a 429 response:

```json
{
  "data": null,
  "error": {
    "message": "Rate limit exceeded",
    "code": "RATE_LIMITED",
    "hint": "Wait 30 seconds before making more requests",
    "statusCode": 429
  }
}
```

With headers:

```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1702459230
Retry-After: 30
```

## Handling Rate Limits

### Basic Retry

```typescript
async function fetchWithRateLimit(url: string, options: RequestInit) {
  const response = await fetch(url, options);

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const delay = retryAfter ? parseInt(retryAfter) * 1000 : 60000;

    console.log(`Rate limited. Retrying in ${delay / 1000}s`);
    await sleep(delay);

    return fetchWithRateLimit(url, options);
  }

  return response;
}
```

### Exponential Backoff

```typescript
async function fetchWithBackoff(
  url: string,
  options: RequestInit,
  attempt = 1,
  maxAttempts = 5
) {
  const response = await fetch(url, options);

  if (response.status === 429 && attempt < maxAttempts) {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);

    console.log(`Rate limited. Attempt ${attempt}/${maxAttempts}. Waiting ${delay}ms`);
    await sleep(delay);

    return fetchWithBackoff(url, options, attempt + 1, maxAttempts);
  }

  return response;
}
```

### Proactive Rate Limiting

Monitor remaining requests and slow down proactively:

```typescript
class RateLimitedClient {
  private remaining = 100;
  private resetAt = 0;

  async fetch(url: string, options: RequestInit) {
    // Wait if we're close to limit
    if (this.remaining < 5 && Date.now() < this.resetAt) {
      const delay = this.resetAt - Date.now();
      console.log(`Proactively waiting ${delay}ms`);
      await sleep(delay);
    }

    const response = await fetch(url, options);

    // Update rate limit state
    const limit = response.headers.get('X-RateLimit-Limit');
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const reset = response.headers.get('X-RateLimit-Reset');

    if (remaining) this.remaining = parseInt(remaining);
    if (reset) this.resetAt = parseInt(reset) * 1000;

    return response;
  }
}
```

## Endpoint-Specific Limits

Some endpoints have additional limits:

| Endpoint | Additional Limit | Reason |
|----------|------------------|--------|
| `POST /api/v1/api-keys` | 10/hour | Prevent key spam |
| `POST /.../credential-leases` | 60/minute | Audited access-only material |
| `POST /.../authorize` | 30/minute | OAuth flows |
| Webhook delivery | 1000/hour | Prevent webhook storms |

## Burst Handling

The rate limiter uses a sliding window algorithm that allows brief bursts:

- **Window size**: 60 seconds
- **Burst allowance**: Up to 2x limit in first 10 seconds
- **Smoothing**: Enforced over full window

Example: With 100 req/min limit:
- First 10 seconds: Up to 50 requests allowed
- After burst: Smoothed to ~1.67 req/second

## Custom Rate Limits

Enterprise customers can configure custom limits:

```json
{
  "organization": {
    "metadata": {
      "rateLimit": {
        "requestsPerMinute": 1000,
        "requestsPerHour": 50000,
        "requestsPerDay": 500000
      }
    }
  }
}
```

## Best Practices

### 1. Batch Requests

Instead of many small requests, batch where possible:

```typescript
// Instead of:
for (const userId of userIds) {
  await authlane.connections.list({ userId });
}

// Use:
const { data } = await authlane.connections.list({
  userIds: userIds,  // Batch parameter
});
```

### 2. Cache Responses

Cache responses that don't change frequently:

```typescript
const cache = new Map();

async function getServices() {
  const cached = cache.get('services');
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const { data } = await authlane.services.list();
  cache.set('services', {
    data,
    expiresAt: Date.now() + 5 * 60 * 1000,  // 5 minute cache
  });

  return data;
}
```

### 3. Use Webhooks

Instead of polling for changes, use webhooks:

```typescript
// Instead of polling every minute:
setInterval(async () => {
  const { data } = await authlane.connections.list({ userId });
  // Check for changes...
}, 60000);

// Configure webhook for connection events:
// POST /api/v1/settings
{
  "webhookUrl": "https://your-app.com/webhook",
  "webhookEvents": ["connection.created", "connection.expired"]
}
```

### 4. Respect Retry-After

Always use the `Retry-After` header when provided:

```typescript
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After');
  if (retryAfter) {
    await sleep(parseInt(retryAfter) * 1000);
  }
}
```

## Monitoring

Monitor your rate limit usage in the dashboard:

- **Current usage**: Requests in current window
- **Historical usage**: Graph of API usage over time
- **Near-limit alerts**: Get notified when approaching limits

Or via API:

```bash
curl -H "Authorization: Bearer ak_..." \
  https://api.authlane.com/api/v1/usage/rate-limits
```

```json
{
  "data": {
    "currentWindow": {
      "limit": 100,
      "used": 42,
      "remaining": 58,
      "resetsAt": "2024-12-12T10:01:00Z"
    },
    "hourly": {
      "limit": 1000,
      "used": 250,
      "remaining": 750
    }
  }
}
```
