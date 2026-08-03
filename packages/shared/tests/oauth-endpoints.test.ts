import { afterEach, describe, expect, it } from 'vitest';
import {
  getOAuthAuthorizationParameters,
  normalizeOAuthScopeNames,
  parseOAuthProviderContext,
  validateOAuthEndpoint,
} from '../src/oauth-endpoints.js';

const originalDemoMode = process.env.AUTHLANE_DEMO_MODE;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalDemoMode === undefined) delete process.env.AUTHLANE_DEMO_MODE;
  else process.env.AUTHLANE_DEMO_MODE = originalDemoMode;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

describe('demo OAuth endpoint allowlist', () => {
  it('allows only the exact local demo endpoints when demo mode is explicitly enabled', () => {
    process.env.AUTHLANE_DEMO_MODE = 'true';
    process.env.NODE_ENV = 'development';

    expect(
      validateOAuthEndpoint(
        'authlane-demo',
        'authorization',
        'http://localhost:5175/demo-provider/authorize'
      )
    ).toBe('http://localhost:5175/demo-provider/authorize');
    expect(
      validateOAuthEndpoint('authlane-demo', 'token', 'http://localhost:5175/demo-provider/token')
    ).toBe('http://localhost:5175/demo-provider/token');
    expect(() =>
      validateOAuthEndpoint('authlane-demo', 'token', 'http://127.0.0.1:5175/demo-provider/token')
    ).toThrow(/not allowlisted/);
  });

  it.each([
    { demoMode: 'false', nodeEnv: 'development' },
    { demoMode: undefined, nodeEnv: 'development' },
    { demoMode: 'true', nodeEnv: 'production' },
  ])('fails closed outside non-production demo mode: %o', ({ demoMode, nodeEnv }) => {
    if (demoMode === undefined) delete process.env.AUTHLANE_DEMO_MODE;
    else process.env.AUTHLANE_DEMO_MODE = demoMode;
    process.env.NODE_ENV = nodeEnv;

    expect(() =>
      validateOAuthEndpoint('authlane-demo', 'token', 'http://localhost:5175/demo-provider/token')
    ).toThrow(/not allowlisted/);
  });
});

describe('provider OAuth endpoint allowlist', () => {
  it('allows the Slack user OAuth endpoints required by the official MCP server', () => {
    expect(
      validateOAuthEndpoint('slack', 'authorization', 'https://slack.com/oauth/v2_user/authorize')
    ).toBe('https://slack.com/oauth/v2_user/authorize');
    expect(
      validateOAuthEndpoint('slack', 'token', 'https://slack.com/api/oauth.v2.user.access')
    ).toBe('https://slack.com/api/oauth.v2.user.access');
  });

  it('serializes provider scopes and required authorization parameters', () => {
    expect(
      Object.fromEntries(getOAuthAuthorizationParameters('linear', ['read', 'write']))
    ).toEqual({ scope: 'read,write' });
    expect(
      Object.fromEntries(getOAuthAuthorizationParameters('slack', ['chat:write', 'channels:read']))
    ).toEqual({ scope: 'chat:write,channels:read' });
    expect(Object.fromEntries(getOAuthAuthorizationParameters('jira', ['read:jira-work']))).toEqual(
      { scope: 'read:jira-work', audience: 'api.atlassian.com', prompt: 'consent' }
    );
    expect(
      Object.fromEntries(
        getOAuthAuthorizationParameters('gmail', ['https://www.googleapis.com/auth/gmail.readonly'])
      )
    ).toEqual({
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    });
    expect(
      Object.fromEntries(getOAuthAuthorizationParameters('pipedrive', ['deals:read']))
    ).toEqual({});
  });

  it('normalizes both source config strings and seeded scope descriptors', () => {
    expect(normalizeOAuthScopeNames(['repo', 'user'])).toEqual(['repo', 'user']);
    expect(
      normalizeOAuthScopeNames([
        { name: 'repo', description: 'Repository access' },
        { name: 'user', description: 'User access' },
      ])
    ).toEqual(['repo', 'user']);
    expect(normalizeOAuthScopeNames([{ description: 'missing name' }])).toBeNull();
  });

  it('accepts only allowlisted provider API origins from token responses', () => {
    expect(
      parseOAuthProviderContext('pipedrive', {
        api_domain: 'https://acme.pipedrive.com',
      })
    ).toEqual({ apiBaseUrl: 'https://acme.pipedrive.com' });
    expect(
      parseOAuthProviderContext('salesforce', {
        instance_url: 'https://acme.my.salesforce.com',
      })
    ).toEqual({ apiBaseUrl: 'https://acme.my.salesforce.com' });
    expect(() =>
      parseOAuthProviderContext('pipedrive', {
        api_domain: 'https://pipedrive.com.evil.example',
      })
    ).toThrow(/approved provider origin/);
    expect(() => parseOAuthProviderContext('salesforce', {})).toThrow(/instance URL/);
    expect(parseOAuthProviderContext('github', {})).toBeUndefined();
  });
});

describe('validateOAuthEndpoint for tenant MCP servers', () => {
  const server = { registeredHost: 'mcp.example.com' };

  it('accepts an endpoint on the registered host', () => {
    expect(
      validateOAuthEndpoint('mcp-1', 'token', 'https://mcp.example.com/token', server)
    ).toBe('https://mcp.example.com/token');
  });

  it('accepts a subdomain of the registered host', () => {
    expect(
      validateOAuthEndpoint('mcp-1', 'token', 'https://auth.mcp.example.com/token', server)
    ).toBe('https://auth.mcp.example.com/token');
  });

  it('refuses another domain even though the value came from our own storage', () => {
    // Re-checked at use time rather than trusted because it was written by discovery: a row edited
    // directly, or a discovery bug, must not be enough to redirect a token exchange.
    expect(() =>
      validateOAuthEndpoint('mcp-1', 'token', 'https://evil.example.net/token', server)
    ).toThrow(/not allowlisted/);
  });

  it('refuses plaintext', () => {
    expect(() =>
      validateOAuthEndpoint('mcp-1', 'token', 'http://mcp.example.com/token', server)
    ).toThrow(/not allowlisted/);
  });

  it('refuses a tenant id with no registered host supplied', () => {
    expect(() => validateOAuthEndpoint('mcp-1', 'token', 'https://mcp.example.com/token')).toThrow(
      /not allowlisted/
    );
  });

  it('does not let a registered host loosen a built-in provider', () => {
    // github's endpoints stay pinned to the static allowlist regardless of what is passed here.
    expect(() =>
      validateOAuthEndpoint('github', 'token', 'https://mcp.example.com/token', server)
    ).toThrow(/not allowlisted/);
  });
});
