import type { OAuth2Credentials } from '@authlane/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tools } from '../tools';

describe('Discord OAuth user tools', () => {
  const credentials: OAuth2Credentials = {
    access_token: 'discord-user-token',
    token_type: 'Bearer',
    scope: 'identify guilds guilds.members.read connections',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports only user-token-compatible tools', () => {
    expect(Object.keys(tools).sort()).toEqual([
      'discord_get_current_user',
      'discord_get_current_user_guild_member',
      'discord_list_connections',
      'discord_list_guilds',
    ]);
  });

  it('gets the connected user with a bearer token', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'user_1' }),
    } as Response);

    await expect(tools.discord_get_current_user.handler({}, credentials)).resolves.toEqual({
      id: 'user_1',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://discord.com/api/v10/users/@me',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer discord-user-token' }),
      })
    );
  });

  it('lists guilds with bounded pagination parameters', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response);

    await tools.discord_list_guilds.handler(
      { after: 'guild_1', limit: 500, with_counts: true },
      credentials
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://discord.com/api/v10/users/@me/guilds?limit=200&with_counts=true&after=guild_1',
      expect.any(Object)
    );
  });

  it('gets the connected user guild member record', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ nick: 'Alice' }),
    } as Response);

    await tools.discord_get_current_user_guild_member.handler(
      { guild_id: 'guild/unsafe' },
      credentials
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://discord.com/api/v10/users/@me/guilds/guild%2Funsafe/member',
      expect.any(Object)
    );
  });

  it('lists the connected user external accounts', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ type: 'github' }],
    } as Response);

    await expect(tools.discord_list_connections.handler({}, credentials)).resolves.toEqual([
      { type: 'github' },
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://discord.com/api/v10/users/@me/connections',
      expect.any(Object)
    );
  });

  it('surfaces Discord error messages without leaking the token', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      statusText: 'Forbidden',
      json: async () => ({ message: 'Missing Access' }),
    } as Response);

    await expect(tools.discord_get_current_user.handler({}, credentials)).rejects.toThrow(
      'Discord API error: Missing Access'
    );
  });
});
