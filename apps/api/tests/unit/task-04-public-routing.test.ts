import { describe, expect, it } from 'vitest';

process.env.AUTHLANE_LOOKUP_KEY_RING ??= `test-lookup:${'02'.repeat(32)}`;
process.env.AUTHLANE_DATA_KEK_RING ??= `test-kek:${'01'.repeat(32)}`;

const [{ createApp }, publicSurface] = await Promise.all([
  import('../../src/index.js'),
  import('../../src/lib/public-surface.js'),
]);

const app = createApp({} as never, {
  publicRoot: 'tests/fixtures/product',
  landingPublicRoot: 'tests/fixtures/landing',
  landingHosts: ['authlane.io', 'authlane.localhost'],
  appHosts: ['app.authlane.io', 'app.authlane.localhost'],
  rateLimitEnabled: false,
});

function request(path: string, host: string) {
  return app.request(path, { headers: { host } });
}

describe('Task 04 public documentation routing', () => {
  it('recognizes only the docs namespace', () => {
    expect('isDocsPath' in publicSurface).toBe(true);

    const isDocsPath = (publicSurface as unknown as { isDocsPath(path: string): boolean })
      .isDocsPath;
    expect(isDocsPath('/docs')).toBe(true);
    expect(isDocsPath('/docs/sdk/python')).toBe(true);
    expect(isDocsPath('/documentation')).toBe(false);
  });

  it('serves nested docs, the read-only reference, and OpenAPI assets from the apex', async () => {
    const cases = [
      ['/docs', 'Docs fixture'],
      ['/docs/sdk/python', 'Python docs fixture'],
      ['/docs/api-reference', 'API reference fixture'],
      ['/docs/openapi.yaml', 'openapi: 3.1.0'],
      ['/docs/openapi.json', '"openapi": "3.1.0"'],
    ] as const;

    for (const [path, body] of cases) {
      const response = await request(path, 'authlane.io');
      expect(response.status, path).toBe(200);
      expect(await response.text(), path).toContain(body);
    }
  });

  it('redirects app docs to the apex with pathname and query before CORS', async () => {
    const response = await app.request('/docs/sdk/python?format=openapi&source=dashboard', {
      headers: {
        host: 'app.authlane.io',
        origin: 'https://app.example.com',
      },
    });

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://authlane.io/docs/sdk/python?format=openapi&source=dashboard'
    );
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('preserves pathname and query while redirecting www', async () => {
    const response = await request(
      '/docs/api-reference?operation=createConnectSession',
      'www.authlane.io'
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://authlane.io/docs/api-reference?operation=createConnectSession'
    );
  });
});
