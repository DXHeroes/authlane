import { describe, expect, it } from 'vitest';
import { isProductOnlyPath, resolvePublicSurface } from '../../src/lib/public-surface.js';

const config = {
  landingHosts: ['authlane.io', 'authlane.localhost'],
  appHosts: ['app.authlane.io', 'app.authlane.localhost'],
};

describe('public surface host policy', () => {
  it('normalizes configured landing and app hosts', () => {
    expect(resolvePublicSurface(' AUTHLANE.IO:443 ', config)).toEqual({ kind: 'landing' });
    expect(resolvePublicSurface('APP.AUTHLANE.IO:3000', config)).toEqual({ kind: 'app' });
    expect(
      resolvePublicSurface('tenant.localhost:3000', {
        landingHosts: [],
        appHosts: ['TENANT.LOCALHOST:3000'],
      })
    ).toEqual({ kind: 'app' });
  });

  it('redirects the www apex host', () => {
    expect(resolvePublicSurface('WWW.AUTHLANE.IO:443', config)).toEqual({
      kind: 'redirect',
      location: 'https://authlane.io',
    });
  });

  it('keeps localhost and loopback addresses on the app surface', () => {
    for (const host of ['localhost:3000', '127.0.0.1:3000', '127.42.0.9', '[::1]:3000']) {
      expect(resolvePublicSurface(host, config)).toEqual({ kind: 'app' });
    }

    expect(
      resolvePublicSurface('localhost', {
        landingHosts: ['localhost'],
        appHosts: [],
      })
    ).toEqual({ kind: 'app' });
  });

  it('enables the www redirect only when the apex landing host is configured', () => {
    expect(
      resolvePublicSurface('www.authlane.io', {
        landingHosts: ['marketing.example'],
        appHosts: ['app.example'],
      })
    ).toEqual({ kind: 'unavailable' });
  });

  it('fails closed for absent, malformed, and unknown hosts', () => {
    for (const host of [
      undefined,
      '',
      'unknown.example',
      'authlane.io.evil.example',
      'authlane.io@evil.example',
      'authlane.io:443:80',
      '[::2]:3000',
    ]) {
      expect(resolvePublicSurface(host, config)).toEqual({ kind: 'unavailable' });
    }
  });
});

describe('public surface path policy', () => {
  it('marks product route families as app-only', () => {
    for (const path of [
      '/api',
      '/api/v1/services',
      '/connect',
      '/connect/callback',
      '/login',
      '/login/reset',
      '/register',
      '/register/confirm',
      '/dashboard',
      '/dashboard/settings',
      '/docs',
      '/docs/getting-started',
    ]) {
      expect(isProductOnlyPath(path)).toBe(true);
    }
  });

  it('does not deny similarly named landing paths', () => {
    for (const path of ['/', '/apiary', '/connection', '/documentation']) {
      expect(isProductOnlyPath(path)).toBe(false);
    }
  });
});
