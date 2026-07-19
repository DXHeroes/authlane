import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/index.js';

describe('public authentication configuration', () => {
  it('returns only the selected mode and sign-up policy', async () => {
    const response = await createApp({} as never, {
      authMode: 'magic-link',
      signUpEnabled: true,
      rateLimitEnabled: false,
    }).request('https://app.authlane.io/api/auth/config');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      data: { mode: 'magic-link', signUpEnabled: true },
      error: null,
    });
  });

  it('does not disclose email-provider or secret configuration', async () => {
    const response = await createApp({} as never, {
      authMode: 'email-password',
      signUpEnabled: false,
      rateLimitEnabled: false,
    }).request('https://app.authlane.io/api/auth/config');
    const body = JSON.stringify(await response.json());

    expect(body).not.toContain('RESEND');
    expect(body).not.toContain('EMAIL_FROM');
    expect(body).not.toContain('secret');
  });
});
