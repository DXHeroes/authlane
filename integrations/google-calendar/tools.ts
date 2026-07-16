/**
 * Google Calendar Integration Tools
 * Executable tool handlers with credential injection
 */

import type { OAuth2Credentials, ToolHandler } from '@authlane/shared';

/**
 * Make Google Calendar API request with OAuth token
 */
async function gcalRequest(
  endpoint: string,
  credentials: OAuth2Credentials,
  options: RequestInit = {}
): Promise<unknown> {
  const response = await fetch(`https://www.googleapis.com/calendar/v3${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ message: response.statusText }))) as {
      message?: string;
      errorMessages?: string[];
    };
    throw new Error(`Google Calendar API error: ${error.message || response.statusText}`);
  }

  // DELETE requests may return 204 No Content
  if (response.status === 204) {
    return { success: true };
  }

  return response.json();
}

/**
 * Google Calendar Tools
 */
export const tools: Record<string, ToolHandler> = {
  gcal_create_event: {
    definition: {
      name: 'gcal_create_event',
      description: 'Creates a new event in Google Calendar',
      inputSchema: {
        type: 'object',
        properties: {
          calendar_id: {
            type: 'string',
            description: 'Calendar identifier (use "primary" for the main calendar)',
            default: 'primary',
          },
          summary: {
            type: 'string',
            description: 'Title/summary of the event',
          },
          description: {
            type: 'string',
            description: 'Description of the event',
          },
          start_time: {
            type: 'string',
            description:
              'Start date-time in RFC3339 format (e.g., "2024-01-15T09:00:00-07:00") or date for all-day events (e.g., "2024-01-15")',
          },
          end_time: {
            type: 'string',
            description:
              'End date-time in RFC3339 format (e.g., "2024-01-15T10:00:00-07:00") or date for all-day events (e.g., "2024-01-15")',
          },
          timezone: {
            type: 'string',
            description:
              'Time zone for the event (e.g., "America/Los_Angeles"). Uses calendar default if not specified',
          },
          location: {
            type: 'string',
            description: 'Location of the event (e.g., "Conference Room A", "123 Main St")',
          },
          attendees: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                email: { type: 'string' },
                optional: { type: 'boolean', default: false },
                displayName: { type: 'string' },
              },
              required: ['email'],
            },
            description: 'List of attendees for the event',
          },
          reminders: {
            type: 'object',
            properties: {
              useDefault: {
                type: 'boolean',
                description: 'Use calendar default reminders (default: true)',
                default: true,
              },
              overrides: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    method: {
                      type: 'string',
                      enum: ['email', 'popup'],
                      description: 'Reminder method',
                    },
                    minutes: {
                      type: 'number',
                      description: 'Minutes before event to trigger reminder',
                    },
                  },
                  required: ['method', 'minutes'],
                },
                description: 'Custom reminder overrides',
              },
            },
          },
          recurrence: {
            type: 'array',
            items: { type: 'string' },
            description: 'Recurrence rules in RRULE format (e.g., ["RRULE:FREQ=DAILY;COUNT=10"])',
          },
          color_id: {
            type: 'string',
            description: 'Color ID for the event (1-11)',
          },
          visibility: {
            type: 'string',
            enum: ['default', 'public', 'private', 'confidential'],
            description: 'Visibility of the event',
            default: 'default',
          },
          send_updates: {
            type: 'string',
            enum: ['all', 'externalOnly', 'none'],
            description: 'Whether to send notifications about event creation (default: "none")',
            default: 'none',
          },
        },
        required: ['summary', 'start_time', 'end_time'],
      },
    },
    handler: async (params, credentials) => {
      const {
        calendar_id = 'primary',
        summary,
        description,
        start_time,
        end_time,
        timezone,
        location,
        attendees,
        reminders,
        recurrence,
        color_id,
        visibility,
        send_updates = 'none',
      } = params as {
        calendar_id?: string;
        summary: string;
        description?: string;
        start_time: string;
        end_time: string;
        timezone?: string;
        location?: string;
        attendees?: unknown[];
        reminders?: unknown;
        recurrence?: string[];
        color_id?: string;
        visibility?: string;
        send_updates?: string;
      };

      // Determine if it's an all-day event
      const isAllDay = !start_time.includes('T');

      const event: Record<string, unknown> = {
        summary,
        start: isAllDay ? { date: start_time } : { dateTime: start_time, timeZone: timezone },
        end: isAllDay ? { date: end_time } : { dateTime: end_time, timeZone: timezone },
      };

      if (description) event.description = description;
      if (location) event.location = location;
      if (attendees) event.attendees = attendees;
      if (reminders) event.reminders = reminders;
      if (recurrence) event.recurrence = recurrence;
      if (color_id) event.colorId = color_id;
      if (visibility) event.visibility = visibility;

      return gcalRequest(
        `/calendars/${calendar_id}/events?sendUpdates=${send_updates}`,
        credentials,
        {
          method: 'POST',
          body: JSON.stringify(event),
        }
      );
    },
  },

  gcal_list_events: {
    definition: {
      name: 'gcal_list_events',
      description: 'Lists events from a Google Calendar with optional filtering and pagination',
      inputSchema: {
        type: 'object',
        properties: {
          calendar_id: {
            type: 'string',
            description: 'Calendar identifier (use "primary" for the main calendar)',
            default: 'primary',
          },
          time_min: {
            type: 'string',
            description:
              'Lower bound (inclusive) for event start time in RFC3339 format (e.g., "2024-01-01T00:00:00Z"). Defaults to current time',
          },
          time_max: {
            type: 'string',
            description:
              'Upper bound (exclusive) for event start time in RFC3339 format (e.g., "2024-12-31T23:59:59Z")',
          },
          max_results: {
            type: 'number',
            description: 'Maximum number of events to return (default: 10, max: 2500)',
            default: 10,
            maximum: 2500,
          },
          page_token: {
            type: 'string',
            description: 'Page token for pagination to get next page of results',
          },
          order_by: {
            type: 'string',
            enum: ['startTime', 'updated'],
            description: 'Order of events returned (startTime requires singleEvents=true)',
          },
          single_events: {
            type: 'boolean',
            description:
              'Whether to expand recurring events into individual instances (default: false)',
            default: false,
          },
          show_deleted: {
            type: 'boolean',
            description: 'Include deleted events (default: false)',
            default: false,
          },
          q: {
            type: 'string',
            description: 'Free text search query',
          },
          updated_min: {
            type: 'string',
            description: 'Lower bound for event last modification time in RFC3339 format',
          },
          timezone: {
            type: 'string',
            description: 'Time zone for the response (e.g., "America/Los_Angeles")',
          },
        },
        required: [],
      },
    },
    handler: async (params, credentials) => {
      const {
        calendar_id = 'primary',
        time_min,
        time_max,
        max_results = 10,
        page_token,
        order_by,
        single_events = false,
        show_deleted = false,
        q,
        updated_min,
        timezone,
      } = params as {
        calendar_id?: string;
        time_min?: string;
        time_max?: string;
        max_results?: number;
        page_token?: string;
        order_by?: string;
        single_events?: boolean;
        show_deleted?: boolean;
        q?: string;
        updated_min?: string;
        timezone?: string;
      };

      const queryParams: string[] = [`maxResults=${max_results}`, `singleEvents=${single_events}`];
      if (time_min) queryParams.push(`timeMin=${encodeURIComponent(time_min)}`);
      if (time_max) queryParams.push(`timeMax=${encodeURIComponent(time_max)}`);
      if (page_token) queryParams.push(`pageToken=${encodeURIComponent(page_token)}`);
      if (order_by) queryParams.push(`orderBy=${order_by}`);
      if (show_deleted) queryParams.push(`showDeleted=${show_deleted}`);
      if (q) queryParams.push(`q=${encodeURIComponent(q)}`);
      if (updated_min) queryParams.push(`updatedMin=${encodeURIComponent(updated_min)}`);
      if (timezone) queryParams.push(`timeZone=${encodeURIComponent(timezone)}`);

      return gcalRequest(`/calendars/${calendar_id}/events?${queryParams.join('&')}`, credentials);
    },
  },

  gcal_update_event: {
    definition: {
      name: 'gcal_update_event',
      description: 'Updates an existing event in Google Calendar',
      inputSchema: {
        type: 'object',
        properties: {
          calendar_id: {
            type: 'string',
            description: 'Calendar identifier (use "primary" for the main calendar)',
            default: 'primary',
          },
          event_id: {
            type: 'string',
            description: 'Event identifier to update',
          },
          summary: {
            type: 'string',
            description: 'New title/summary of the event',
          },
          description: {
            type: 'string',
            description: 'New description of the event',
          },
          start_time: {
            type: 'string',
            description:
              'New start date-time in RFC3339 format (e.g., "2024-01-15T09:00:00-07:00") or date for all-day events',
          },
          end_time: {
            type: 'string',
            description:
              'New end date-time in RFC3339 format (e.g., "2024-01-15T10:00:00-07:00") or date for all-day events',
          },
          timezone: {
            type: 'string',
            description: 'Time zone for the event (e.g., "America/Los_Angeles")',
          },
          location: {
            type: 'string',
            description: 'New location of the event',
          },
          attendees: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                email: { type: 'string' },
                optional: { type: 'boolean', default: false },
                displayName: { type: 'string' },
              },
              required: ['email'],
            },
            description: 'Updated list of attendees (replaces existing)',
          },
          reminders: {
            type: 'object',
            properties: {
              useDefault: {
                type: 'boolean',
                description: 'Use calendar default reminders',
              },
              overrides: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    method: {
                      type: 'string',
                      enum: ['email', 'popup'],
                    },
                    minutes: { type: 'number' },
                  },
                  required: ['method', 'minutes'],
                },
                description: 'Custom reminder overrides',
              },
            },
          },
          recurrence: {
            type: 'array',
            items: { type: 'string' },
            description: 'Updated recurrence rules in RRULE format',
          },
          color_id: {
            type: 'string',
            description: 'Color ID for the event (1-11)',
          },
          visibility: {
            type: 'string',
            enum: ['default', 'public', 'private', 'confidential'],
            description: 'Visibility of the event',
          },
          status: {
            type: 'string',
            enum: ['confirmed', 'tentative', 'cancelled'],
            description: 'Event status',
          },
          send_updates: {
            type: 'string',
            enum: ['all', 'externalOnly', 'none'],
            description: 'Whether to send notifications about event updates (default: "none")',
            default: 'none',
          },
        },
        required: ['event_id'],
      },
    },
    handler: async (params, credentials) => {
      const {
        calendar_id = 'primary',
        event_id,
        summary,
        description,
        start_time,
        end_time,
        timezone,
        location,
        attendees,
        reminders,
        recurrence,
        color_id,
        visibility,
        status,
        send_updates = 'none',
      } = params as {
        calendar_id?: string;
        event_id: string;
        summary?: string;
        description?: string;
        start_time?: string;
        end_time?: string;
        timezone?: string;
        location?: string;
        attendees?: unknown[];
        reminders?: unknown;
        recurrence?: string[];
        color_id?: string;
        visibility?: string;
        status?: string;
        send_updates?: string;
      };

      const event: Record<string, unknown> = {};

      if (summary) event.summary = summary;
      if (description) event.description = description;
      if (location) event.location = location;
      if (attendees) event.attendees = attendees;
      if (reminders) event.reminders = reminders;
      if (recurrence) event.recurrence = recurrence;
      if (color_id) event.colorId = color_id;
      if (visibility) event.visibility = visibility;
      if (status) event.status = status;

      if (start_time) {
        const isAllDay = !start_time.includes('T');
        event.start = isAllDay
          ? { date: start_time }
          : { dateTime: start_time, timeZone: timezone };
      }

      if (end_time) {
        const isAllDay = !end_time.includes('T');
        event.end = isAllDay ? { date: end_time } : { dateTime: end_time, timeZone: timezone };
      }

      return gcalRequest(
        `/calendars/${calendar_id}/events/${event_id}?sendUpdates=${send_updates}`,
        credentials,
        {
          method: 'PATCH',
          body: JSON.stringify(event),
        }
      );
    },
  },

  gcal_get_event: {
    definition: {
      name: 'gcal_get_event',
      description: 'Gets details of a specific event by ID',
      inputSchema: {
        type: 'object',
        properties: {
          calendar_id: {
            type: 'string',
            description: 'Calendar identifier (use "primary" for the main calendar)',
            default: 'primary',
          },
          event_id: {
            type: 'string',
            description: 'Event identifier',
          },
          timezone: {
            type: 'string',
            description: 'Time zone for the response (e.g., "America/Los_Angeles")',
          },
        },
        required: ['event_id'],
      },
    },
    handler: async (params, credentials) => {
      const {
        calendar_id = 'primary',
        event_id,
        timezone,
      } = params as {
        calendar_id?: string;
        event_id: string;
        timezone?: string;
      };

      const query = timezone ? `?timeZone=${encodeURIComponent(timezone)}` : '';
      return gcalRequest(`/calendars/${calendar_id}/events/${event_id}${query}`, credentials);
    },
  },

  gcal_delete_event: {
    definition: {
      name: 'gcal_delete_event',
      description: 'Deletes an event from Google Calendar',
      inputSchema: {
        type: 'object',
        properties: {
          calendar_id: {
            type: 'string',
            description: 'Calendar identifier (use "primary" for the main calendar)',
            default: 'primary',
          },
          event_id: {
            type: 'string',
            description: 'Event identifier to delete',
          },
          send_updates: {
            type: 'string',
            enum: ['all', 'externalOnly', 'none'],
            description: 'Whether to send notifications about event deletion (default: "none")',
            default: 'none',
          },
        },
        required: ['event_id'],
      },
    },
    handler: async (params, credentials) => {
      const {
        calendar_id = 'primary',
        event_id,
        send_updates = 'none',
      } = params as {
        calendar_id?: string;
        event_id: string;
        send_updates?: string;
      };

      return gcalRequest(
        `/calendars/${calendar_id}/events/${event_id}?sendUpdates=${send_updates}`,
        credentials,
        {
          method: 'DELETE',
        }
      );
    },
  },

  gcal_list_calendars: {
    definition: {
      name: 'gcal_list_calendars',
      description: 'Lists all calendars accessible to the user',
      inputSchema: {
        type: 'object',
        properties: {
          min_access_role: {
            type: 'string',
            enum: ['freeBusyReader', 'reader', 'writer', 'owner'],
            description: 'Minimum access role for calendars to include',
          },
          show_deleted: {
            type: 'boolean',
            description: 'Include deleted calendars (default: false)',
            default: false,
          },
          show_hidden: {
            type: 'boolean',
            description: 'Include hidden calendars (default: false)',
            default: false,
          },
          max_results: {
            type: 'number',
            description: 'Maximum number of calendars to return (default: 100, max: 250)',
            default: 100,
            maximum: 250,
          },
          page_token: {
            type: 'string',
            description: 'Page token for pagination',
          },
        },
        required: [],
      },
    },
    handler: async (params, credentials) => {
      const {
        min_access_role,
        show_deleted = false,
        show_hidden = false,
        max_results = 100,
        page_token,
      } = params as {
        min_access_role?: string;
        show_deleted?: boolean;
        show_hidden?: boolean;
        max_results?: number;
        page_token?: string;
      };

      const queryParams: string[] = [`maxResults=${max_results}`];
      if (min_access_role) queryParams.push(`minAccessRole=${min_access_role}`);
      if (show_deleted) queryParams.push(`showDeleted=${show_deleted}`);
      if (show_hidden) queryParams.push(`showHidden=${show_hidden}`);
      if (page_token) queryParams.push(`pageToken=${encodeURIComponent(page_token)}`);

      return gcalRequest(`/users/me/calendarList?${queryParams.join('&')}`, credentials);
    },
  },

  gcal_quick_add: {
    definition: {
      name: 'gcal_quick_add',
      description:
        'Creates an event based on a simple text string (e.g., "Dinner with John tomorrow at 7pm")',
      inputSchema: {
        type: 'object',
        properties: {
          calendar_id: {
            type: 'string',
            description: 'Calendar identifier (use "primary" for the main calendar)',
            default: 'primary',
          },
          text: {
            type: 'string',
            description:
              'Natural language description of the event (e.g., "Appointment at Somewhere on June 3rd 10am-10:25am")',
          },
          send_updates: {
            type: 'string',
            enum: ['all', 'externalOnly', 'none'],
            description: 'Whether to send notifications (default: "none")',
            default: 'none',
          },
        },
        required: ['text'],
      },
    },
    handler: async (params, credentials) => {
      const {
        calendar_id = 'primary',
        text,
        send_updates = 'none',
      } = params as {
        calendar_id?: string;
        text: string;
        send_updates?: string;
      };

      return gcalRequest(
        `/calendars/${calendar_id}/events/quickAdd?text=${encodeURIComponent(text)}&sendUpdates=${send_updates}`,
        credentials,
        {
          method: 'POST',
        }
      );
    },
  },
};
