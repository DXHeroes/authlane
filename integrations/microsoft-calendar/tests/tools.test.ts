import type { OAuth2Credentials } from '@authlane/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tools } from '../tools.js';

const credentials: OAuth2Credentials = {
  access_token: 'graph-access-token',
  token_type: 'Bearer',
  scope: 'Calendars.ReadWrite',
};

const response = (data: unknown = { value: [] }, status = 200): Response =>
  new Response(status === 204 ? null : JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('Microsoft Calendar Graph tools', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
  });

  it('exposes concrete calendar tools with risk metadata', () => {
    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining([
        'microsoft_calendar_list_events',
        'microsoft_calendar_get_schedule',
        'microsoft_calendar_create_event',
        'microsoft_calendar_delete_event',
      ])
    );
    expect(tools.microsoft_calendar_list_events!.definition.annotations.readOnlyHint).toBe(true);
    expect(tools.microsoft_calendar_delete_event!.definition.annotations.destructiveHint).toBe(true);
  });

  it('reads a calendar view from a fixed Graph endpoint', async () => {
    await tools.microsoft_calendar_get_calendar_view!.handler(
      {
        start_time: '2026-07-21T08:00:00Z',
        end_time: '2026-07-22T08:00:00Z',
      },
      credentials
    );

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/graph\.microsoft\.com\/v1\.0\/me\/calendarView\?startDateTime=/
      ),
      expect.any(Object)
    );
  });

  it('creates an event using normalized Graph date-time fields', async () => {
    await tools.microsoft_calendar_create_event!.handler(
      {
        subject: 'Authlane test',
        start_time: '2026-07-21T10:00:00',
        end_time: '2026-07-21T10:30:00',
        timezone: 'Europe/Prague',
      },
      credentials
    );

    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/events');
    expect(init).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      subject: 'Authlane test',
      start: { dateTime: '2026-07-21T10:00:00', timeZone: 'Europe/Prague' },
      end: { dateTime: '2026-07-21T10:30:00', timeZone: 'Europe/Prague' },
    });
  });
});
