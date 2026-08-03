import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildInvitationLink, getAppUrl } from '../../src/lib/app-url.js';

describe('getAppUrl', () => {
  // stubEnv rather than assigning process.env directly: vitest restores it even if an assertion
  // throws, so a leaked APP_URL cannot make an unrelated suite fail depending on file order.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads APP_URL', () => {
    vi.stubEnv('APP_URL', 'https://app.authlane.io');
    expect(getAppUrl()).toBe('https://app.authlane.io');
  });

  it('falls back to the local dashboard origin', () => {
    vi.stubEnv('APP_URL', '');
    expect(getAppUrl()).toBe('http://localhost:5173');
  });

  it('drops a trailing slash so links do not double up', () => {
    vi.stubEnv('APP_URL', 'https://app.authlane.io/');
    expect(getAppUrl()).toBe('https://app.authlane.io');
  });
});

describe('buildInvitationLink', () => {
  it('points at the nested dashboard route', () => {
    expect(buildInvitationLink('https://app.authlane.io', 'inv_123')).toBe(
      'https://app.authlane.io/dashboard/accept-invitation/inv_123'
    );
  });

  it('encodes an id that would otherwise break the path', () => {
    expect(buildInvitationLink('https://app.authlane.io', 'a/b?c')).toBe(
      'https://app.authlane.io/dashboard/accept-invitation/a%2Fb%3Fc'
    );
  });
});
