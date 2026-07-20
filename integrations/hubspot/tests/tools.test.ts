import type { OAuth2Credentials } from '@authlane/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tools } from '../tools';

describe('HubSpot read tools', () => {
  const credentials: OAuth2Credentials = {
    access_token: 'hubspot-token',
    token_type: 'Bearer',
    scope: '',
  };

  beforeEach(() => vi.clearAllMocks());

  it('exports only the four deterministic read wrappers', () => {
    expect(Object.keys(tools).sort()).toEqual([
      'hubspot_get_contact',
      'hubspot_get_deal',
      'hubspot_list_contacts',
      'hubspot_list_deals',
    ]);
  });

  it('lists contacts through CRM search for direct compatibility tests', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response);
    await tools.hubspot_list_contacts.handler({ limit: 20 }, credentials);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.hubapi.com/crm/v3/objects/contacts/search',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('encodes record IDs and selects requested properties', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'contact/1' }),
    } as Response);
    await tools.hubspot_get_contact.handler(
      { contactId: 'contact/1', properties: ['email'] },
      credentials
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.hubapi.com/crm/v3/objects/contacts/contact%2F1?archived=false&properties=email',
      expect.any(Object)
    );
  });
});
