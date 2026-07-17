import { describe, expect, it } from 'vitest';

process.env.AUTHLANE_LOOKUP_KEY_RING ??= `test-lookup:${'02'.repeat(32)}`;
process.env.AUTHLANE_DATA_KEK_RING ??= `test-kek:${'01'.repeat(32)}`;

const { createApp } = await import('../../src/index.js');

const app = createApp({} as never, {
  publicRoot: 'tests/fixtures/product',
  landingPublicRoot: 'tests/fixtures/landing',
  landingHosts: ['authlane.io', 'authlane.localhost'],
  appHosts: ['app.authlane.io', 'app.authlane.localhost'],
  rateLimitEnabled: false,
});

function request(path: string, host: string, headers: Record<string, string> = {}) {
  return app.request(path, { headers: { host, ...headers } });
}

function preflight(host: string) {
  return app.request('/api/v1/services', {
    method: 'OPTIONS',
    headers: {
      host,
      origin: 'http://localhost:5173',
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'authorization',
    },
  });
}

describe('host-aware public routing', () => {
  it('serves the landing and product documents from separate roots', async () => {
    const landing = await request('/', 'AUTHLANE.IO:443');
    const product = await request('/', 'app.authlane.io');

    expect(landing.status).toBe(200);
    expect(await landing.text()).toContain('Landing fixture');
    expect(product.status).toBe(200);
    expect(await product.text()).toContain('Product fixture');
  });

  it('serves only allowlisted landing assets from the landing root', async () => {
    const nextAsset = await request('/_next/static/landing.js', 'authlane.io');
    const favicon = await request('/favicon.ico', 'authlane.io');
    const productAsset = await request('/assets/product.js', 'authlane.io');

    expect(nextAsset.status).toBe(200);
    expect(await nextAsset.text()).toContain('landing-static-fixture');
    expect(favicon.status).toBe(200);
    expect(productAsset.status).toBe(404);
    expect(await productAsset.text()).not.toContain('product-static-fixture');
  });

  it('serves product assets and connect fallbacks only on the app surface', async () => {
    const productAsset = await request('/assets/product.js', 'app.authlane.io');
    const connectAsset = await request('/connect/assets/widget.js', 'app.authlane.io');
    const connect = await request('/connect/start', 'app.authlane.io');

    expect(productAsset.status).toBe(200);
    expect(await productAsset.text()).toContain('product-static-fixture');
    expect(connectAsset.status).toBe(200);
    expect(await connectAsset.text()).toContain('connect-static-fixture');
    expect(connect.status).toBe(200);
    expect(await connect.text()).toContain('Connect fixture');
  });

  it('serves landing-built docs only on the app surface', async () => {
    const appDocs = await request('/docs', 'app.authlane.io');
    const appDocsSlash = await request('/docs/', 'app.authlane.io');
    const missingAppDocs = await request('/docs/missing', 'app.authlane.io');
    const landingDocs = await request('/docs', 'authlane.io');

    expect(appDocs.status).toBe(200);
    expect(await appDocs.text()).toContain('Docs fixture');
    expect(appDocsSlash.status).toBe(200);
    expect(await appDocsSlash.text()).toContain('Docs fixture');
    expect(missingAppDocs.status).toBe(404);
    expect(await missingAppDocs.text()).not.toContain('Product fixture');
    expect(landingDocs.status).toBe(404);
    expect(await landingDocs.text()).not.toContain('Docs fixture');
  });

  it('retains product authentication and dashboard fallbacks on the app surface', async () => {
    for (const path of ['/login', '/register', '/dashboard', '/dashboard/settings']) {
      const response = await request(path, 'app.authlane.io');
      expect(response.status, path).toBe(200);
      expect(await response.text(), path).toContain('Product fixture');
    }
  });

  it('denies every product-only route on the landing surface', async () => {
    for (const path of [
      '/api/v1/services',
      '/connect',
      '/login',
      '/register',
      '/dashboard',
      '/docs',
    ]) {
      const response = await request(path, 'authlane.io');
      expect(response.status, path).toBe(404);
      expect(await response.text(), path).not.toContain('Product fixture');
    }
  });

  it('returns the landing 404 without crossing into the product root', async () => {
    const unknown = await request('/unknown', 'authlane.io');
    const traversal = await request('/_next/%2e%2e/%2e%2e/assets/product.js', 'authlane.io');

    expect(unknown.status).toBe(404);
    expect(await unknown.text()).toContain('Landing 404 fixture');
    expect(traversal.status).toBe(404);
    expect(await traversal.text()).not.toContain('product-static-fixture');
  });

  it('fails closed for unknown hosts on landing and product routes', async () => {
    for (const path of ['/', '/api/v1/services', '/connect', '/dashboard', '/docs']) {
      const response = await request(path, 'unknown.example');
      expect(response.status, path).toBe(404);
      const body = await response.text();
      expect(body, path).not.toContain('Landing fixture');
      expect(body, path).not.toContain('Product fixture');
    }
  });

  it('denies landing, unknown, and malformed host preflights before CORS and API routing', async () => {
    for (const host of ['authlane.io', 'unknown.example', 'malformed:443:80']) {
      const response = await preflight(host);

      expect(response.status, host).toBe(404);
      expect(response.headers.get('access-control-allow-origin'), host).toBeNull();
      expect(response.headers.get('x-content-type-options'), host).toBe('nosniff');
      expect(response.headers.get('x-request-id'), host).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it('redirects the configured www host preflight before CORS and API routing', async () => {
    const response = await preflight('www.authlane.io');

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('https://authlane.io');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('continues app host preflights to CORS', async () => {
    const response = await preflight('app.authlane.io');

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('ignores x-forwarded-host when selecting a public surface', async () => {
    const forgedApp = await request('/', 'unknown.example', {
      'x-forwarded-host': 'app.authlane.io',
    });
    const forgedLanding = await request('/', 'authlane.io', {
      'x-forwarded-host': 'app.authlane.io',
    });

    expect(forgedApp.status).toBe(404);
    expect(forgedLanding.status).toBe(200);
    expect(await forgedLanding.text()).toContain('Landing fixture');
  });

  it('handles health before host policy for every host', async () => {
    for (const host of ['unknown.example', 'AUTHLANE.IO:443', 'malformed:443:80']) {
      expect((await request('/health', host)).status, host).toBe(200);
    }
  });

  it('permanently redirects the www apex and keeps local development on app', async () => {
    const redirect = await request('/', 'www.authlane.io');
    const local = await request('/', '[::1]:3000');

    expect(redirect.status).toBe(308);
    expect(redirect.headers.get('location')).toBe('https://authlane.io');
    expect(local.status).toBe(200);
    expect(await local.text()).toContain('Product fixture');
  });
});
