# Google Calendar Integration

Connect to Google Calendar for scheduling and event management.

## Overview

| Property | Value |
|----------|-------|
| **Service ID** | `google-calendar` |
| **Name** | Google Calendar |
| **Auth Type** | OAuth 2.0 |
| **Documentation** | [Google Calendar API](https://developers.google.com/calendar) |

## OAuth Configuration

### Authorization URL
```
https://accounts.google.com/o/oauth2/v2/auth
```

### Token URL
```
https://oauth2.googleapis.com/token
```

## Scopes

### Available Scopes

| Scope | Description |
|-------|-------------|
| `https://www.googleapis.com/auth/calendar` | Full access to calendars |
| `https://www.googleapis.com/auth/calendar.readonly` | Read-only calendar access |
| `https://www.googleapis.com/auth/calendar.events` | Read/write events |
| `https://www.googleapis.com/auth/calendar.events.readonly` | Read-only events access |

### Default Scopes

```yaml
- https://www.googleapis.com/auth/calendar.events
- https://www.googleapis.com/auth/calendar.readonly
```

## Connection Example

```typescript
// Start OAuth flow
const { data } = await authlane.oauth.authorize({
  userId: 'user_123',
  serviceId: 'google-calendar',
  scopes: [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly',
  ],
});

// Redirect user
window.location.href = data.authorizationUrl;
```

## Using Credentials

```typescript
// Get credentials
const { data: creds } = await authlane.connections.getCredentials({
  userId: 'user_123',
  serviceId: 'google-calendar',
});

// List upcoming events
const response = await fetch(
  'https://www.googleapis.com/calendar/v3/calendars/primary/events?' +
    new URLSearchParams({
      timeMin: new Date().toISOString(),
      maxResults: '10',
      singleEvents: 'true',
      orderBy: 'startTime',
    }),
  {
    headers: {
      Authorization: `Bearer ${creds.access_token}`,
    },
  }
);
```

## Available Tools

### google_calendar_list_events
List calendar events.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'google_calendar_list_events',
  parameters: {
    calendarId: 'primary',
    timeMin: '2025-01-15T00:00:00Z',
    timeMax: '2025-01-22T00:00:00Z',
    maxResults: 50,
  },
});
```

### google_calendar_create_event
Create a new calendar event.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'google_calendar_create_event',
  parameters: {
    calendarId: 'primary',
    summary: 'Team Meeting',
    description: 'Weekly sync',
    start: '2025-01-20T10:00:00-05:00',
    end: '2025-01-20T11:00:00-05:00',
    attendees: ['alice@example.com', 'bob@example.com'],
  },
});
```

### google_calendar_get_free_busy
Check availability for a time range.

```typescript
await authlane.tools.execute({
  userId: 'user_123',
  tool: 'google_calendar_get_free_busy',
  parameters: {
    timeMin: '2025-01-20T08:00:00Z',
    timeMax: '2025-01-20T18:00:00Z',
    items: [{ id: 'primary' }],
  },
});
```

## Setup Guide

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the Google Calendar API

### 2. Configure OAuth Consent Screen

1. Navigate to "APIs & Services" → "OAuth consent screen"
2. Choose user type (Internal or External)
3. Fill in app information
4. Add required scopes

### 3. Create OAuth Credentials

1. Navigate to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: Web application
4. Add redirect URI: `https://your-domain.com/api/v1/oauth/callback/google-calendar`

### 4. Configure in Authlane

```typescript
await authlane.services.configure({
  serviceId: 'google-calendar',
  clientId: 'your-client-id.apps.googleusercontent.com',
  clientSecret: 'your-client-secret',
});
```

## Important Notes

### Primary Calendar

Use `primary` as the calendar ID to access the user's default calendar.

### Timezone Handling

Event times should include timezone information:
- ISO 8601 format with offset: `2025-01-20T10:00:00-05:00`
- Or with timezone name: `2025-01-20T10:00:00` + `timeZone: 'America/New_York'`

### All-Day Events

For all-day events, use date instead of dateTime:

```typescript
{
  start: { date: '2025-01-20' },
  end: { date: '2025-01-21' }, // Exclusive end date
}
```

## Links

- [Google Calendar API Documentation](https://developers.google.com/calendar)
- [API Reference](https://developers.google.com/calendar/api/v3/reference)
- [OAuth Scopes](https://developers.google.com/calendar/api/auth)

