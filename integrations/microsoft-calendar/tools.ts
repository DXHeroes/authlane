import { publicToolDefinitionsByService } from '@authlane/integration-contracts';
import type { OAuth2Credentials, ToolHandler } from '@authlane/shared';

const graphOrigin = 'https://graph.microsoft.com';
const graphBaseUrl = `${graphOrigin}/v1.0`;

function requiredString(params: Record<string, unknown>, name: string): string {
  const value = params[name];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Invalid ${name}`);
  return value;
}

function optionalString(params: Record<string, unknown>, name: string): string | undefined {
  const value = params[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Invalid ${name}`);
  return value;
}

function positiveLimit(params: Record<string, unknown>): number {
  const value = params.limit ?? 25;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 100) {
    throw new Error('Invalid limit');
  }
  return Number(value);
}

function requiredStringArray(params: Record<string, unknown>, name: string): string[] {
  const value = params[name];
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 100 ||
    value.some((entry) => typeof entry !== 'string' || entry.length === 0)
  ) {
    throw new Error(`Invalid ${name}`);
  }
  return value as string[];
}

function decodeCursor(cursor: unknown, expectedPath: string): string | undefined {
  if (cursor === undefined) return undefined;
  if (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > 8_192) {
    throw new Error('Invalid cursor');
  }
  let url: URL;
  try {
    url = new URL(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid cursor');
  }
  if (url.origin !== graphOrigin || url.pathname !== `/v1.0${expectedPath}`) {
    throw new Error('Invalid cursor');
  }
  return url.toString();
}

function withCursor(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const object = { ...(data as Record<string, unknown>) };
  const nextLink = object['@odata.nextLink'];
  delete object['@odata.nextLink'];
  if (typeof nextLink === 'string') object.nextCursor = Buffer.from(nextLink).toString('base64url');
  return object;
}

async function graphRequest(
  endpoint: string,
  credentials: OAuth2Credentials,
  options: RequestInit = {}
): Promise<unknown> {
  const url = endpoint.startsWith('https://') ? endpoint : `${graphBaseUrl}${endpoint}`;
  if (!url.startsWith(`${graphBaseUrl}/`)) throw new Error('Invalid Microsoft Graph endpoint');
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${credentials.access_token}`,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`Microsoft Graph request failed (${response.status})`);
  if (response.status === 202 || response.status === 204) return { success: true };
  const text = await response.text();
  return text.length === 0 ? { success: true } : withCursor(JSON.parse(text) as unknown);
}

function calendarCollectionPath(calendarId: string | undefined, suffix: string): string {
  return calendarId ? `/me/calendars/${encodeURIComponent(calendarId)}/${suffix}` : `/me/${suffix}`;
}

function eventBody(params: Record<string, unknown>, partial = false): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (!partial || params.subject !== undefined) body.subject = requiredString(params, 'subject');
  if (typeof params.body === 'string') {
    body.body = {
      contentType: params.body_type === 'html' ? 'HTML' : 'Text',
      content: params.body,
    };
  }
  if (!partial || params.start_time !== undefined) {
    body.start = {
      dateTime: requiredString(params, 'start_time'),
      timeZone: optionalString(params, 'timezone') ?? 'UTC',
    };
  }
  if (!partial || params.end_time !== undefined) {
    body.end = {
      dateTime: requiredString(params, 'end_time'),
      timeZone: optionalString(params, 'timezone') ?? 'UTC',
    };
  }
  if (typeof params.location === 'string') body.location = { displayName: params.location };
  if (params.attendees !== undefined) {
    body.attendees = requiredStringArray(params, 'attendees').map((address) => ({
      emailAddress: { address },
      type: 'required',
    }));
  }
  if (typeof params.is_online_meeting === 'boolean') {
    body.isOnlineMeeting = params.is_online_meeting;
    if (params.is_online_meeting) body.onlineMeetingProvider = 'teamsForBusiness';
  }
  return body;
}

async function execute(
  toolName: string,
  params: Record<string, unknown>,
  credentials: OAuth2Credentials
): Promise<unknown> {
  if (toolName === 'microsoft_calendar_list_calendars') {
    const path = '/me/calendars';
    const cursor = decodeCursor(params.cursor, path);
    return graphRequest(
      cursor ?? `${path}?${new URLSearchParams({ $top: String(positiveLimit(params)) })}`,
      credentials
    );
  }
  if (toolName === 'microsoft_calendar_list_events') {
    const path = calendarCollectionPath(optionalString(params, 'calendar_id'), 'events');
    const cursor = decodeCursor(params.cursor, path);
    return graphRequest(
      cursor ?? `${path}?${new URLSearchParams({ $top: String(positiveLimit(params)) })}`,
      credentials
    );
  }
  if (toolName === 'microsoft_calendar_get_event') {
    const calendarId = optionalString(params, 'calendar_id');
    const eventId = encodeURIComponent(requiredString(params, 'event_id'));
    return graphRequest(
      calendarId
        ? `/me/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`
        : `/me/events/${eventId}`,
      credentials
    );
  }
  if (toolName === 'microsoft_calendar_get_calendar_view') {
    const path = calendarCollectionPath(optionalString(params, 'calendar_id'), 'calendarView');
    const cursor = decodeCursor(params.cursor, path);
    if (cursor) return graphRequest(cursor, credentials);
    const query = new URLSearchParams({
      startDateTime: requiredString(params, 'start_time'),
      endDateTime: requiredString(params, 'end_time'),
      $top: String(positiveLimit(params)),
    });
    return graphRequest(`${path}?${query}`, credentials);
  }
  if (toolName === 'microsoft_calendar_get_schedule') {
    const interval = params.interval_minutes ?? 30;
    if (!Number.isInteger(interval) || Number(interval) < 5 || Number(interval) > 1_440) {
      throw new Error('Invalid interval_minutes');
    }
    return graphRequest('/me/calendar/getSchedule', credentials, {
      method: 'POST',
      body: JSON.stringify({
        schedules: requiredStringArray(params, 'schedules'),
        startTime: {
          dateTime: requiredString(params, 'start_time'),
          timeZone: optionalString(params, 'timezone') ?? 'UTC',
        },
        endTime: {
          dateTime: requiredString(params, 'end_time'),
          timeZone: optionalString(params, 'timezone') ?? 'UTC',
        },
        availabilityViewInterval: Number(interval),
      }),
    });
  }
  if (toolName === 'microsoft_calendar_create_calendar') {
    return graphRequest('/me/calendars', credentials, {
      method: 'POST',
      body: JSON.stringify({ name: requiredString(params, 'name') }),
    });
  }
  if (toolName === 'microsoft_calendar_update_calendar') {
    const body: Record<string, unknown> = {};
    if (typeof params.name === 'string') body.name = params.name;
    if (typeof params.color === 'string') body.color = params.color;
    if (Object.keys(body).length === 0) throw new Error('At least one update field is required');
    return graphRequest(
      `/me/calendars/${encodeURIComponent(requiredString(params, 'calendar_id'))}`,
      credentials,
      { method: 'PATCH', body: JSON.stringify(body) }
    );
  }
  if (toolName === 'microsoft_calendar_delete_calendar') {
    return graphRequest(
      `/me/calendars/${encodeURIComponent(requiredString(params, 'calendar_id'))}`,
      credentials,
      { method: 'DELETE' }
    );
  }
  if (toolName === 'microsoft_calendar_create_event') {
    return graphRequest(
      calendarCollectionPath(optionalString(params, 'calendar_id'), 'events'),
      credentials,
      { method: 'POST', body: JSON.stringify(eventBody(params)) }
    );
  }
  if (toolName === 'microsoft_calendar_update_event') {
    const calendarId = optionalString(params, 'calendar_id');
    const eventId = encodeURIComponent(requiredString(params, 'event_id'));
    const body = eventBody(params, true);
    if (Object.keys(body).length === 0) throw new Error('At least one update field is required');
    return graphRequest(
      calendarId
        ? `/me/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`
        : `/me/events/${eventId}`,
      credentials,
      { method: 'PATCH', body: JSON.stringify(body) }
    );
  }
  if (toolName === 'microsoft_calendar_respond_to_event') {
    const response = requiredString(params, 'response');
    if (!['accept', 'tentativelyAccept', 'decline'].includes(response)) {
      throw new Error('Invalid response');
    }
    return graphRequest(
      `/me/events/${encodeURIComponent(requiredString(params, 'event_id'))}/${response}`,
      credentials,
      {
        method: 'POST',
        body: JSON.stringify({
          comment: typeof params.comment === 'string' ? params.comment : '',
          sendResponse: params.send_response !== false,
        }),
      }
    );
  }
  if (toolName === 'microsoft_calendar_cancel_event') {
    return graphRequest(
      `/me/events/${encodeURIComponent(requiredString(params, 'event_id'))}/cancel`,
      credentials,
      {
        method: 'POST',
        body: JSON.stringify({ comment: typeof params.comment === 'string' ? params.comment : '' }),
      }
    );
  }
  if (toolName === 'microsoft_calendar_delete_event') {
    const calendarId = optionalString(params, 'calendar_id');
    const eventId = encodeURIComponent(requiredString(params, 'event_id'));
    return graphRequest(
      calendarId
        ? `/me/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`
        : `/me/events/${eventId}`,
      credentials,
      { method: 'DELETE' }
    );
  }
  throw new Error('Unsupported Microsoft Calendar tool');
}

export const tools: Record<string, ToolHandler> = Object.fromEntries(
  publicToolDefinitionsByService['microsoft-calendar'].map((definition) => [
    definition.name,
    {
      definition: {
        name: definition.name,
        description: definition.description,
        annotations: definition.annotations,
        inputSchema: definition.inputSchema as ToolHandler['definition']['inputSchema'],
      },
      handler: (params: Record<string, unknown>, credentials: OAuth2Credentials) =>
        execute(definition.name, params, credentials),
    },
  ])
);
