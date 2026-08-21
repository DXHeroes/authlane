import { describe, expect, it } from 'vitest';
import {
  isDocsPath,
  isProductOnlyPath,
  resolvePublicSurface,
} from '../../src/lib/public-surface.js';

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

  it('canonicalizes expanded IPv6 loopback without accepting other IPv6 addresses', () => {
    for (const host of ['[0:0:0:0:0:0:0:1]', '[0:0:0:0:0:0:0:1]:3000']) {
      expect(resolvePublicSurface(host, config)).toEqual({ kind: 'app' });
    }

    expect(resolvePublicSurface('[0:0:0:0:0:0:0:2]:3000', config)).toEqual({
      kind: 'unavailable',
    });
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
      '/service-icons/github.svg',
    ]) {
      expect(isProductOnlyPath(path)).toBe(true);
    }
  });

  it('keeps the docs namespace on the public landing surface', () => {
    expect(isDocsPath('/docs')).toBe(true);
    expect(isDocsPath('/docs/getting-started')).toBe(true);
    expect(isProductOnlyPath('/docs')).toBe(false);
  });

  it('does not deny similarly named landing paths', () => {
    for (const path of ['/', '/apiary', '/connection', '/documentation']) {
      expect(isProductOnlyPath(path)).toBe(false);
    }
  });
});
