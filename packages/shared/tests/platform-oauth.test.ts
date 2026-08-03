import { afterEach, describe, expect, it } from 'vitest';
import {
  getPlatformOAuthCredentials,
  hasPlatformOAuthCredentials,
  platformOAuthEnvPrefix,
} from '../src/platform-oauth.js';

describe('platform OAuth credentials', () => {
  const touched = new Set<string>();

  function setEnv(name: string, value: string | undefined) {
    touched.add(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  afterEach(() => {
    for (const name of touched) delete process.env[name];
    touched.clear();
  });

  it('derives the environment prefix from the service id', () => {
    expect(platformOAuthEnvPrefix('github')).toBe('AUTHLANE_OAUTH_GITHUB');
    expect(platformOAuthEnvPrefix('google-calendar')).toBe('AUTHLANE_OAUTH_GOOGLE_CALENDAR');
    expect(platformOAuthEnvPrefix('microsoft-sharepoint')).toBe(
      'AUTHLANE_OAUTH_MICROSOFT_SHAREPOINT'
    );
  });

  it('returns null when no platform application is configured', () => {
    expect(getPlatformOAuthCredentials('github')).toBeNull();
    expect(hasPlatformOAuthCredentials('github')).toBe(false);
  });

  it('reads the configured application', () => {
    setEnv('AUTHLANE_OAUTH_GITHUB_CLIENT_ID', 'platform-client');
    setEnv('AUTHLANE_OAUTH_GITHUB_CLIENT_SECRET', 'platform-secret');
    expect(getPlatformOAuthCredentials('github')).toEqual({
      clientId: 'platform-client',
      clientSecret: 'platform-secret',
    });
    expect(hasPlatformOAuthCredentials('github')).toBe(true);
  });

  it('allows a public client with no secret', () => {
    setEnv('AUTHLANE_OAUTH_LINEAR_CLIENT_ID', 'public-client');
    expect(getPlatformOAuthCredentials('linear')).toEqual({
      clientId: 'public-client',
      clientSecret: '',
    });
  });

  it('ignores a secret with no client id', () => {
    setEnv('AUTHLANE_OAUTH_SLACK_CLIENT_SECRET', 'orphan-secret');
    expect(getPlatformOAuthCredentials('slack')).toBeNull();
  });

  it('trims surrounding whitespace from copied values', () => {
    setEnv('AUTHLANE_OAUTH_NOTION_CLIENT_ID', '  spaced-client \n');
    setEnv('AUTHLANE_OAUTH_NOTION_CLIENT_SECRET', ' spaced-secret ');
    expect(getPlatformOAuthCredentials('notion')).toEqual({
      clientId: 'spaced-client',
      clientSecret: 'spaced-secret',
    });
  });

  it('treats a blank client id as unconfigured', () => {
    setEnv('AUTHLANE_OAUTH_STRIPE_CLIENT_ID', '   ');
    expect(getPlatformOAuthCredentials('stripe')).toBeNull();
  });

  it('keeps services independent', () => {
    setEnv('AUTHLANE_OAUTH_GITHUB_CLIENT_ID', 'github-client');
    expect(getPlatformOAuthCredentials('gmail')).toBeNull();
  });
});
