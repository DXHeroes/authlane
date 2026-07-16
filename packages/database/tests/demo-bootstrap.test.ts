import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_SERVICE, demoServiceConfig } from '../src/demo-bootstrap.js';

describe('demo bootstrap security contract', () => {
  it('defines only an exact localhost OAuth provider with PKCE and refresh enabled', () => {
    expect(DEMO_SERVICE.id).toBe('authlane-demo');
    expect(demoServiceConfig()).toEqual(
      expect.objectContaining({
        authorization_url: 'http://localhost:5175/demo-provider/authorize',
        token_url: 'http://localhost:5175/demo-provider/token',
        pkce_required: true,
        supports_refresh_token: true,
        default_scopes: ['demo:read'],
      })
    );
  });

  it('does not ship a fixed local account or password in the ordinary seed', () => {
    const seed = readFileSync(join(import.meta.dirname, '../src/seed.ts'), 'utf8');
    expect(seed).not.toContain('test@authlane.dev');
    expect(seed).not.toContain('test123456');
    expect(seed).not.toContain('Test Credentials');
  });
});
