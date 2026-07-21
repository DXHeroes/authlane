import type { OAuth2Credentials } from '@authlane/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tools } from '../tools.js';

const credentials: OAuth2Credentials = {
  access_token: 'graph-access-token',
  token_type: 'Bearer',
  scope: 'Mail.Read Mail.ReadWrite Mail.Send',
};

const response = (data: unknown = { value: [] }, status = 200): Response =>
  new Response(status === 204 ? null : JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('Microsoft Mail Graph tools', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
  });

  it('exposes explicit Graph tools instead of a generic provider proxy', () => {
    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining([
        'microsoft_mail_list_messages',
        'microsoft_mail_get_message',
        'microsoft_mail_create_draft',
        'microsoft_mail_send_message',
        'microsoft_mail_delete_message',
      ])
    );
    expect(Object.keys(tools).some((name) => name.includes('fetch'))).toBe(false);
    expect(Object.keys(tools).some((name) => name.includes('entity'))).toBe(false);
  });

  it('lists messages through a fixed Microsoft Graph v1.0 endpoint', async () => {
    await tools.microsoft_mail_list_messages!.handler(
      { folder_id: 'inbox', limit: 25 },
      credentials
    );

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/graph\.microsoft\.com\/v1\.0\/me\/mailFolders\/inbox\/messages\?/
      ),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer graph-access-token' }),
      })
    );
  });

  it('rejects a forged cursor that leaves the exact collection path', async () => {
    const cursor = Buffer.from(
      'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/other-resource'
    ).toString('base64url');

    await expect(
      tools.microsoft_mail_list_messages!.handler({ folder_id: 'inbox', cursor }, credentials)
    ).rejects.toThrow('Invalid cursor');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends mail using a typed Graph request body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({}, 202));

    await tools.microsoft_mail_send_message!.handler(
      {
        to: ['person@example.com'],
        subject: 'Authlane test',
        body: 'Production-like sandbox check',
      },
      credentials
    );

    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/sendMail');
    expect(init).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      message: {
        subject: 'Authlane test',
        body: { contentType: 'Text', content: 'Production-like sandbox check' },
        toRecipients: [{ emailAddress: { address: 'person@example.com' } }],
      },
    });
  });

  it('marks message deletion as destructive and uses the fixed message route', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({}, 204));
    expect(tools.microsoft_mail_delete_message!.definition.annotations.destructiveHint).toBe(true);

    await tools.microsoft_mail_delete_message!.handler({ message_id: 'message-1' }, credentials);

    expect(fetch).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me/messages/message-1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
