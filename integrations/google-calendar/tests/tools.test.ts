import type { OAuth2Credentials } from '@authlane/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tools } from '../tools';

describe('Google Calendar Integration Tools', () => {
  const mockCredentials: OAuth2Credentials = {
    access_token: 'ya29.test_google_token',
    token_type: 'Bearer',
    scope: 'https://www.googleapis.com/auth/calendar',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gcal_create_event: tool definition', () => {
    expect(tools.gcal_create_event.definition.name).toBe('gcal_create_event');
  });

  it('gcal_list_events: lists events', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    } as Response);

    await tools.gcal_list_events.handler({ calendarId: 'primary' }, mockCredentials);
    expect(global.fetch).toHaveBeenCalled();
  });

  it('gcal_list_calendars: lists calendars', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    } as Response);

    await tools.gcal_list_calendars.handler({}, mockCredentials);
    expect(global.fetch).toHaveBeenCalled();
  });

  it('handles errors', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      statusText: 'Not Found',
      json: async () => ({ error: { message: 'Not found' } }),
    } as Response);

    await expect(
      tools.gcal_list_events.handler({ calendarId: 'invalid' }, mockCredentials)
    ).rejects.toThrow();
  });
});
