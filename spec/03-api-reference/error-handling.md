# Error Handling

Authlane uses a consistent error response format inspired by Supabase.

## Response Format

### Success Response

```json
{
  "data": { ... },
  "error": null
}
```

### Error Response

```json
{
  "data": null,
  "error": {
    "message": "Human-readable error message",
    "code": "ERROR_CODE",
    "hint": "Suggestion for fixing the error",
    "docUrl": "https://docs.authlane.com/errors/ERROR_CODE",
    "statusCode": 400
  }
}
```

## Error Object Fields

| Field | Type | Description |
|-------|------|-------------|
| `message` | string | Human-readable error description |
| `code` | string | Machine-readable error code |
| `hint` | string | Optional suggestion for resolution |
| `docUrl` | string | Optional link to documentation |
| `statusCode` | number | HTTP status code |

## Error Codes

### Authentication Errors (401)

| Code | Message | Hint |
|------|---------|------|
| `UNAUTHORIZED` | Authentication required | Include an API key in the Authorization header |
| `INVALID_API_KEY` | Invalid API key | Check that the API key is correct and not expired |
| `SESSION_EXPIRED` | Session expired | Please log in again |
| `TOKEN_EXPIRED` | Token has expired | Refresh the token or re-authenticate |

### Authorization Errors (403)

| Code | Message | Hint |
|------|---------|------|
| `FORBIDDEN` | Access denied | You don't have permission for this operation |
| `INSUFFICIENT_PERMISSIONS` | Insufficient permissions | Your role doesn't allow this action |
| `ORG_ACCESS_DENIED` | Organization access denied | You're not a member of this organization |

### Not Found Errors (404)

| Code | Message | Hint |
|------|---------|------|
| `NOT_FOUND` | Resource not found | Check that the ID is correct |
| `CONNECTION_NOT_FOUND` | Connection not found | The user hasn't connected this service |
| `SERVICE_NOT_FOUND` | Service not found | Check the service ID |
| `USER_NOT_FOUND` | User not found | Check the user ID |

### Validation Errors (400)

| Code | Message | Hint |
|------|---------|------|
| `VALIDATION_ERROR` | Validation failed | Check the request body |
| `INVALID_PARAMETER` | Invalid parameter | See hint for details |
| `MISSING_PARAMETER` | Missing required parameter | Include the required field |

### OAuth Errors (400)

| Code | Message | Hint |
|------|---------|------|
| `OAUTH_ERROR` | OAuth flow failed | Check OAuth configuration |
| `INVALID_STATE` | Invalid state parameter | The OAuth state doesn't match |
| `TOKEN_EXCHANGE_FAILED` | Token exchange failed | Check client credentials |
| `INVALID_REDIRECT_URI` | Invalid redirect URI | The redirect URI is not allowed |

### Rate Limit Errors (429)

| Code | Message | Hint |
|------|---------|------|
| `RATE_LIMITED` | Rate limit exceeded | Wait before making more requests |
| `TOO_MANY_REQUESTS` | Too many requests | Slow down request frequency |

### Server Errors (500)

| Code | Message | Hint |
|------|---------|------|
| `INTERNAL_ERROR` | Internal server error | Contact support if this persists |
| `SERVICE_UNAVAILABLE` | Service temporarily unavailable | Try again later |
| `ENCRYPTION_ERROR` | Encryption/decryption failed | Contact support |

## HTTP Status Code Mapping

| Status | Meaning | When Used |
|--------|---------|-----------|
| 200 | OK | Successful GET, PUT, DELETE |
| 201 | Created | Successful POST (resource created) |
| 400 | Bad Request | Validation error, invalid parameters |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Authenticated but not authorized |
| 404 | Not Found | Resource doesn't exist |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server error |
| 503 | Service Unavailable | Temporary outage |

## Handling Errors

### TypeScript/JavaScript

```typescript
const { data, error } = await authlane.connections.list({
  userId: 'user_123',
});

if (error) {
  switch (error.code) {
    case 'UNAUTHORIZED':
      // Redirect to login
      window.location.href = '/login';
      break;

    case 'RATE_LIMITED':
      // Wait and retry
      await sleep(error.retryAfter || 60000);
      return retry();

    case 'CONNECTION_NOT_FOUND':
      // Show connect prompt
      showConnectPrompt();
      break;

    default:
      // Show generic error
      console.error(error.message);
      showError(error.message);
  }
  return;
}

// Use data...
```

### cURL

```bash
# Capture HTTP status code and body
response=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer ak_..." \
  https://api.authlane.com/api/v1/connections)

body=$(echo "$response" | head -n -1)
status=$(echo "$response" | tail -n 1)

if [ "$status" != "200" ]; then
  error=$(echo "$body" | jq -r '.error.message')
  echo "Error: $error"
fi
```

## Validation Errors

Validation errors include details about which fields failed:

```json
{
  "data": null,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "hint": "Check the following fields: name (required), email (invalid format)",
    "statusCode": 400,
    "details": [
      {
        "field": "name",
        "message": "Required"
      },
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  }
}
```

## Retry Strategy

For transient errors, implement exponential backoff:

```typescript
async function fetchWithRetry(
  fn: () => Promise<Response>,
  maxRetries = 3
): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fn();

    if (response.ok) return response;

    // Don't retry client errors
    if (response.status >= 400 && response.status < 500) {
      return response;
    }

    // Exponential backoff
    const delay = Math.min(1000 * Math.pow(2, i), 10000);
    await sleep(delay);
  }

  throw new Error('Max retries exceeded');
}
```

## Error Logging

The SDK logs errors automatically:

```typescript
const authlane = new Authlane({
  apiKey: 'ak_...',
  logger: {
    error: (message, error) => {
      // Send to your logging service
      Sentry.captureException(error);
    },
  },
});
```

## Security Considerations

Error messages are designed to be helpful without leaking sensitive information:

- **No internal details** - Stack traces, file paths, etc. are not exposed
- **Generic 404s** - "Not found" vs "Access denied" to prevent enumeration
- **Rate limited info** - Doesn't reveal exact limits or windows
- **Auth errors** - Generic "Invalid credentials" vs "User doesn't exist"
