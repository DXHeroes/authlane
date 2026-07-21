import type { OAuth2Credentials } from '@authlane/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tools } from '../tools.js';

const credentials: OAuth2Credentials = {
  access_token: 'graph-access-token',
  token_type: 'Bearer',
  scope: 'Files.ReadWrite.All Sites.ReadWrite.All',
};

const response = (data: unknown = { value: [] }, status = 200): Response =>
  new Response(status === 204 ? null : JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('Microsoft SharePoint Graph tools', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
  });

  it('exposes explicit Drive and SharePoint tools', () => {
    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining([
        'microsoft_sharepoint_search_sites',
        'microsoft_sharepoint_list_drives',
        'microsoft_sharepoint_list_items',
        'microsoft_sharepoint_upload_file',
        'microsoft_sharepoint_delete_item',
      ])
    );
    expect(Object.keys(tools).some((name) => name.includes('entity'))).toBe(false);
  });

  it('searches sites through Microsoft Graph', async () => {
    await tools.microsoft_sharepoint_search_sites!.handler({ query: 'DX Heroes' }, credentials);

    expect(fetch).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/sites?search=DX+Heroes',
      expect.any(Object)
    );
  });

  it('uploads small files through the fixed drive content endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ id: 'file-1' }, 201));
    await tools.microsoft_sharepoint_upload_file!.handler(
      {
        drive_id: 'drive-1',
        parent_item_id: 'root',
        file_name: 'authlane.txt',
        content_base64: Buffer.from('sandbox').toString('base64'),
      },
      credentials
    );

    expect(fetch).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/drives/drive-1/items/root:/authlane.txt:/content',
      expect.objectContaining({ method: 'PUT', body: expect.any(Uint8Array) })
    );
  });

  it('marks item deletion as destructive', () => {
    expect(tools.microsoft_sharepoint_delete_item!.definition.annotations.destructiveHint).toBe(
      true
    );
  });
});
