import { afterEach, describe, expect, it } from 'vitest';
import { validateOAuthEndpoint } from '../src/oauth-endpoints.js';

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
