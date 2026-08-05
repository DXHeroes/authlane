import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicApiBase } from '../../src/lib/public-api-base.js';

describe('publicApiBase', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers the configured public origin over the one the request arrived on', () => {
    vi.stubEnv('BETTER_AUTH_URL', 'https://app.authlane.io');

    expect(publicApiBase('http://10.0.0.4:3000/api/v1/connect/mcp-1/authorize')).toBe(
      'https://app.authlane.io'
    );
  });

  it('falls back to the request origin when nothing is configured', () => {
    vi.stubEnv('BETTER_AUTH_URL', '');

    expect(publicApiBase('http://localhost:3000/api/v1/connect/mcp-1/authorize')).toBe(
      'http://localhost:3000'
    );
  });
});

/**
 * The redirect URI is agreed with the provider once and checked on every authorization. Three
 * places produce it — the authorize redirect, dynamic client registration, and the value the
 * dashboard shows a tenant to paste into their own application — and if any of them drifts, the
 * provider rejects the redirect and nothing in Authlane's logs says why.
 *
 * A source-level assertion because there is no runtime moment where all three meet.
 */
describe('every redirect URI comes from the same origin', () => {
  const read = (path: string) => readFileSync(join(import.meta.dirname, '../../src', path), 'utf8');

  it('registers a dynamic client with the origin the authorize step will send', () => {
    // APP_URL is the dashboard, a different origin from the API in development. A client
    // registered against it names a callback the token exchange never uses.
    expect(read('routes/mcp-servers.ts')).toContain('apiBaseUrl: publicApiBase(requestUrl)');
    expect(read('routes/mcp-servers.ts')).not.toContain('process.env.APP_URL');
  });

  it('builds the callback path in one place', () => {
    expect(read('lib/mcp-client-registration.ts')).toContain(
      'export function mcpCallbackUrl(apiBaseUrl: string, serverId: string): string {'
    );
    expect(read('routes/oauth.ts')).toContain('publicApiBase(requestUrl)');
  });

  it('keeps the origin itself in one place', () => {
    // A second copy is how the two drifted apart before.
    expect(read('routes/oauth.ts')).not.toContain('function publicApiBase');
    expect(read('routes/mcp-servers.ts')).not.toContain('function publicApiBase');
  });
});
