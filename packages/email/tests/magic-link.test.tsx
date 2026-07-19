import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();

vi.mock('../src/client.js', () => ({
  getEmailClient: () => ({ emails: { send } }),
  getEmailConfig: () => ({
    apiKey: 'test-key',
    fromAddress: 'Authlane <auth@mail.authlane.io>',
    appUrl: 'https://app.authlane.io',
  }),
}));

import { sendMagicLink } from '../src/send.js';

describe('magic-link email delivery', () => {
  beforeEach(() => {
    send.mockReset();
  });

  it('sends a ten-minute sign-in link from the configured sender', async () => {
    send.mockResolvedValue({ data: { id: 'email_1' }, error: null });

    const result = await sendMagicLink('developer@example.com', {
      magicLink: 'https://app.authlane.io/api/auth/magic-link/verify?token=private',
      expiresIn: '10 minutes',
    });

    expect(result).toEqual({ success: true, messageId: 'email_1' });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Authlane <auth@mail.authlane.io>',
        to: 'developer@example.com',
        subject: 'Sign in to Authlane',
      })
    );
  });

  it('reports provider rejection instead of returning false success', async () => {
    send.mockResolvedValue({ data: null, error: { message: 'provider rejected request' } });

    await expect(
      sendMagicLink('developer@example.com', {
        magicLink: 'https://app.authlane.io/api/auth/magic-link/verify?token=private',
      })
    ).resolves.toEqual({ success: false, error: 'provider rejected request' });
  });
});
