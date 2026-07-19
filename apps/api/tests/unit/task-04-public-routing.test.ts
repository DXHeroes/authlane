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

const executableInlineScriptPattern =
  /<script\b(?![^>]*\btype=(['"])application\/ld\+json\1)(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script\s*>/i;

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
      ['/llms.txt', 'Authlane LLM index fixture'],
      ['/llms-full.txt', 'Authlane full LLM context fixture'],
    ] as const;

    for (const [path, body] of cases) {
      const response = await request(path, 'authlane.io');
      expect(response.status, path).toBe(200);
      expect(await response.text(), path).toContain(body);
    }
  });

  it('redirects root LLM documentation assets from the app surface to the apex', async () => {
    for (const path of ['/llms.txt', '/llms-full.txt']) {
      const response = await request(path, 'app.authlane.io');

      expect(response.status, path).toBe(308);
      expect(response.headers.get('location'), path).toBe(`https://authlane.io${path}`);
    }
  });

  it('serves downloadable documentation assets with tooling-friendly content types', async () => {
    const cases = [
      ['/docs/openapi.yaml', 'application/yaml'],
      ['/docs/openapi.json', 'application/json'],
      ['/docs/markdown/quickstart.md', 'text/markdown'],
      ['/llms.txt', 'text/plain'],
    ] as const;

    for (const [path, contentType] of cases) {
      const response = await request(path, 'authlane.io');

      expect(response.status, path).toBe(200);
      expect(response.headers.get('content-type'), path).toContain(contentType);
    }
  });

  it('serves the hydrated API reference under the production self-only script CSP', async () => {
    const response = await request('/docs/api-reference', 'authlane.io');
    const html = await response.text();
    const sources = [...html.matchAll(/<script\b[^>]*\bsrc=(['"])(.*?)\1[^>]*>/gi)].map(
      (match) => match[2]
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(response.headers.get('content-security-policy')).not.toMatch(
      /script-src[^;]*'unsafe-inline'/
    );
    expect(response.headers.get('content-security-policy')).not.toContain('sha256-');
    expect(html).not.toMatch(executableInlineScriptPattern);
    expect(sources).toEqual([
      '/_next/static/chunks/app-0123456789abcdef.js',
      '/_next/static/authlane-next-flight-0123456789ab.js',
    ]);

    for (const source of sources) {
      const asset = await request(source, 'authlane.io');
      expect(asset.status, source).toBe(200);
      expect(asset.headers.get('content-type'), source).toMatch(/javascript/);
      expect(asset.headers.get('cache-control'), source).toBe(
        'public, max-age=31536000, immutable'
      );
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
