import { type APIRequestContext, expect, test } from '@playwright/test';

const origin = process.env.E2E_SINGLE_RUNTIME_ORIGIN ?? 'http://127.0.0.1:3000';
const landingHost = 'authlane.io';
const appHost = 'app.authlane.io';
const landingPublicOrigin = new URL(`https://${landingHost}`);
const appPublicOrigin = new URL(`https://${appHost}`);

type AssetKind = 'css' | 'javascript';

interface AssetValidation {
  allowedPathPrefixes: readonly string[];
  expectedOrigin: URL;
  pathnameSuffix: string;
}

function htmlAttributes(tag: string): ReadonlyMap<string, string | undefined> {
  const attributes = new Map<string, string | undefined>();
  const source = tag.replace(/^<[^\s>]+/, '').replace(/\/?>$/, '');
  const pattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (const match of source.matchAll(pattern)) {
    const name = match[1].toLowerCase();
    if (attributes.has(name)) {
      throw new Error(`Duplicate ${name} attribute in emitted HTML`);
    }
    attributes.set(name, match[2] ?? match[3] ?? match[4]);
  }

  return attributes;
}

function emittedAssetReferences(html: string, kind: AssetKind): string[] {
  const tagPattern =
    kind === 'css'
      ? /<link\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi
      : /<script\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
  const references: string[] = [];

  for (const match of html.matchAll(tagPattern)) {
    const attributes = htmlAttributes(match[0]);
    if (kind === 'css') {
      const rel = attributes.get('rel');
      if (!rel?.toLowerCase().split(/\s+/).includes('stylesheet')) {
        continue;
      }
      const href = attributes.get('href');
      if (href !== undefined) {
        references.push(href);
      }
      continue;
    }

    const src = attributes.get('src');
    if (src !== undefined) {
      references.push(src);
    }
  }

  return references;
}

function validatedPublicAsset(reference: string, baseUrl: URL, validation: AssetValidation): URL {
  if (!reference || reference !== reference.trim()) {
    throw new Error('Emitted asset reference is empty or contains surrounding whitespace');
  }
  if (/^data:/i.test(reference)) {
    throw new Error('Data asset references are not allowed');
  }
  if (reference.startsWith('//')) {
    throw new Error('Protocol-relative asset references are not allowed');
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(reference) && !/^https?:/i.test(reference)) {
    throw new Error('Only HTTP(S) asset references are allowed');
  }

  let resolved: URL;
  try {
    resolved = new URL(reference, baseUrl);
    decodeURI(resolved.pathname);
  } catch {
    throw new Error(`Malformed emitted asset reference: ${reference}`);
  }

  if (resolved.origin !== validation.expectedOrigin.origin) {
    throw new Error(`Cross-origin emitted asset reference: ${reference}`);
  }
  if (resolved.username || resolved.password || resolved.hash) {
    throw new Error(`Emitted asset reference contains unsupported URL components: ${reference}`);
  }
  if (!validation.allowedPathPrefixes.some((prefix) => resolved.pathname.startsWith(prefix))) {
    throw new Error(`Emitted asset path is outside the public surface: ${resolved.pathname}`);
  }
  if (!resolved.pathname.endsWith(validation.pathnameSuffix)) {
    throw new Error(`Emitted asset path must end with ${validation.pathnameSuffix}`);
  }

  return resolved;
}

function emittedAsset(
  html: string,
  kind: AssetKind,
  expectedOrigin: URL,
  allowedPathPrefixes: readonly string[]
): URL {
  const references = emittedAssetReferences(html, kind);
  if (references.length === 0) {
    throw new Error(`No emitted ${kind} assets found`);
  }

  const pathnameSuffix = kind === 'css' ? '.css' : '.js';
  const assets = references.map((reference) =>
    validatedPublicAsset(reference, expectedOrigin, {
      allowedPathPrefixes,
      expectedOrigin,
      pathnameSuffix,
    })
  );
  return assets[0];
}

function stylesheetUrlReferences(stylesheet: string): string[] {
  return [...stylesheet.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^"')]*?))\s*\)/gi)].map(
    (match) => match[1] ?? match[2] ?? match[3].trim()
  );
}

function emittedFont(stylesheet: string, stylesheetUrl: URL): URL {
  const references = stylesheetUrlReferences(stylesheet);
  if (references.length === 0) {
    throw new Error('No emitted font assets found in docs stylesheet');
  }

  const fonts = references.map((reference) =>
    validatedPublicAsset(reference, stylesheetUrl, {
      allowedPathPrefixes: ['/_next/static/media/'],
      expectedOrigin: appPublicOrigin,
      pathnameSuffix: '.woff2',
    })
  );
  return fonts[0];
}

function requestPath(asset: URL): string {
  return `${asset.pathname}${asset.search}`;
}

async function expectTextAsset(
  request: APIRequestContext,
  asset: URL,
  kind: AssetKind
): Promise<string> {
  const path = requestPath(asset);
  const response = await request.get(`${origin}${path}`, { headers: { Host: asset.host } });
  const body = await response.text();

  expect(response.status(), `${asset.host}${path}`).toBe(200);
  expect(response.headers()['content-type'], `${asset.host}${path}`).toMatch(
    kind === 'css' ? /^text\/css\b/ : /^(?:text|application)\/javascript\b/
  );
  expect(response.headers()['content-type'], `${asset.host}${path}`).not.toContain('text/html');
  expect(body.length, `${asset.host}${path}`).toBeGreaterThan(0);
  expect(body.trimStart(), `${asset.host}${path}`).not.toMatch(/^<!doctype html|^<html/i);
  return body;
}

test('separates landing and product surfaces in one runtime', async ({ request }) => {
  const landing = await request.get(origin, { headers: { Host: landingHost } });
  expect(landing.status()).toBe(200);
  const landingDocument = await landing.text();
  expect(landingDocument).toContain('<main id="main-content"');
  expect(landingDocument).toContain('data-primary-cta="true"');
  await expectTextAsset(
    request,
    emittedAsset(landingDocument, 'css', landingPublicOrigin, ['/_next/static/']),
    'css'
  );
  await expectTextAsset(
    request,
    emittedAsset(landingDocument, 'javascript', landingPublicOrigin, ['/_next/static/']),
    'javascript'
  );

  const product = await request.get(origin, { headers: { Host: appHost } });
  expect(product.status()).toBe(200);
  const productDocument = await product.text();
  expect(productDocument).toContain('Authlane Dashboard');
  expect(productDocument).toContain('<div id="root"></div>');
  expect(productDocument).not.toContain('data-primary-cta="true"');
  const productCss = emittedAsset(productDocument, 'css', appPublicOrigin, ['/assets/']);
  const productJavascript = emittedAsset(productDocument, 'javascript', appPublicOrigin, [
    '/assets/',
  ]);
  await expectTextAsset(request, productCss, 'css');
  await expectTextAsset(request, productJavascript, 'javascript');

  const connect = await request.get(`${origin}/connect`, { headers: { Host: appHost } });
  expect(connect.status()).toBe(200);
  const connectDocument = await connect.text();
  expect(connectDocument).toContain('Authlane Widget');
  expect(connectDocument).toContain('<div id="root"></div>');
  await expectTextAsset(
    request,
    emittedAsset(connectDocument, 'css', appPublicOrigin, ['/connect/assets/']),
    'css'
  );
  await expectTextAsset(
    request,
    emittedAsset(connectDocument, 'javascript', appPublicOrigin, ['/connect/assets/']),
    'javascript'
  );

  const docs = await request.get(`${origin}/docs`, { headers: { Host: appHost } });
  expect(docs.status()).toBe(200);
  const docsDocument = await docs.text();
  expect(docsDocument).toContain('site-shell docs-shell');
  const docsCssAsset = emittedAsset(docsDocument, 'css', appPublicOrigin, ['/_next/static/']);
  const docsCss = await expectTextAsset(request, docsCssAsset, 'css');
  await expectTextAsset(
    request,
    emittedAsset(docsDocument, 'javascript', appPublicOrigin, ['/_next/static/']),
    'javascript'
  );

  const fontAsset = emittedFont(docsCss, docsCssAsset);
  const fontPath = requestPath(fontAsset);
  const font = await request.get(`${origin}${fontPath}`, { headers: { Host: fontAsset.host } });
  const fontBody = await font.body();
  expect(font.status(), fontPath).toBe(200);
  expect(font.headers()['content-type'], fontPath).toMatch(/^font\/woff2\b/);
  expect(fontBody.length, fontPath).toBeGreaterThan(0);
  expect(fontBody.subarray(0, 256).toString('utf8').trimStart(), fontPath).not.toMatch(
    /^<!doctype html|^<html/i
  );

  for (const host of [landingHost, appHost]) {
    const icon = await request.get(`${origin}/icon.svg`, { headers: { Host: host } });
    const iconBody = await icon.text();
    expect(icon.status(), host).toBe(200);
    expect(icon.headers()['content-type'], host).toMatch(/^image\/svg\+xml\b/);
    expect(icon.headers()['content-type'], host).not.toContain('text/html');
    expect(iconBody.length, host).toBeGreaterThan(0);
    expect(iconBody.trimStart(), host).not.toMatch(/^<!doctype html|^<html/i);
    expect(iconBody.trimStart(), host).toMatch(/^<svg\b/);
  }

  for (const path of [
    '/api/v1/catalog/services',
    '/connect',
    '/docs',
    requestPath(productJavascript),
  ]) {
    expect(
      (await request.get(`${origin}${path}`, { headers: { Host: landingHost } })).status()
    ).toBe(404);
  }

  expect((await request.get(origin, { headers: { Host: 'unknown.example' } })).status()).toBe(404);
  expect(
    (
      await request.get(origin, {
        headers: { Host: 'unknown.example', 'X-Forwarded-Host': appHost },
      })
    ).status()
  ).toBe(404);

  for (const host of [landingHost, appHost, 'unknown.example']) {
    const health = await request.get(`${origin}/health`, { headers: { Host: host } });
    expect(health.status(), host).toBe(200);
    expect(await health.json(), host).toMatchObject({ data: { status: 'ok' }, error: null });
  }
});

test.describe('packaged asset parsing regressions', () => {
  test('ignores arbitrary href and src attributes and accepts either attribute order', () => {
    const html = `
      <a href="/assets/arbitrary.css">not a stylesheet</a>
      <img src="/assets/arbitrary.js" alt="not a script">
      <link href="/assets/dashboard.css?v=1" media="all" rel="stylesheet">
      <script defer src="/assets/dashboard.js?v=1"></script>
    `;

    expect(emittedAsset(html, 'css', appPublicOrigin, ['/assets/']).href).toBe(
      'https://app.authlane.io/assets/dashboard.css?v=1'
    );
    expect(emittedAsset(html, 'javascript', appPublicOrigin, ['/assets/']).href).toBe(
      'https://app.authlane.io/assets/dashboard.js?v=1'
    );
  });

  test('rejects extension query traps and documents with zero emitted assets', () => {
    expect(() =>
      emittedAsset(
        '<link rel="stylesheet" href="/assets/chunk?format=.css">',
        'css',
        appPublicOrigin,
        ['/assets/']
      )
    ).toThrow();
    expect(() =>
      emittedAsset(
        '<script src="/assets/chunk?format=.js"></script>',
        'javascript',
        appPublicOrigin,
        ['/assets/']
      )
    ).toThrow();
    expect(() =>
      emittedAsset('<main>No assets</main>', 'css', appPublicOrigin, ['/assets/'])
    ).toThrow();
  });

  test('rejects every untrusted emitted asset reference', () => {
    for (const reference of [
      'data:text/css,body{}',
      '//evil.example/assets/trap.css',
      'https://evil.example/assets/trap.css',
      'https://[:::]/assets/trap.css',
    ]) {
      expect(() =>
        emittedAsset(
          `<link rel="stylesheet" href="/assets/good.css"><link rel="stylesheet" href="${reference}">`,
          'css',
          appPublicOrigin,
          ['/assets/']
        )
      ).toThrow();
    }
  });

  test('rejects data, protocol-relative, and cross-origin font references', () => {
    const docsCssUrl = new URL('/_next/static/css/docs.css?v=1', appPublicOrigin);
    for (const reference of [
      'data:font/woff2;base64,d09GMgABAAAA',
      '//evil.example/_next/static/media/font.woff2',
      'https://evil.example/_next/static/media/font.woff2',
    ]) {
      expect(() => emittedFont(`@font-face { src: url("${reference}"); }`, docsCssUrl)).toThrow();
    }
  });
});
