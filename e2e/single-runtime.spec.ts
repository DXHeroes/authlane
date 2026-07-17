import { type APIRequestContext, expect, test } from '@playwright/test';

const origin = process.env.E2E_SINGLE_RUNTIME_ORIGIN ?? 'http://127.0.0.1:3000';
const landingHost = 'authlane.io';
const appHost = 'app.authlane.io';

type AssetKind = 'css' | 'javascript';

function emittedAsset(html: string, kind: AssetKind, prefix: string): string {
  const extension = kind === 'css' ? '.css' : '.js';
  const paths = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1]);
  const path = paths.find(
    (candidate) => candidate.startsWith(prefix) && candidate.includes(extension)
  );
  expect(path, `${kind} asset with prefix ${prefix}`).toBeTruthy();
  return path as string;
}

async function expectTextAsset(
  request: APIRequestContext,
  path: string,
  host: string,
  kind: AssetKind
): Promise<string> {
  const response = await request.get(`${origin}${path}`, { headers: { Host: host } });
  const body = await response.text();

  expect(response.status(), `${host}${path}`).toBe(200);
  expect(response.headers()['content-type'], `${host}${path}`).toMatch(
    kind === 'css' ? /^text\/css\b/ : /^(?:text|application)\/javascript\b/
  );
  expect(response.headers()['content-type'], `${host}${path}`).not.toContain('text/html');
  expect(body.trimStart(), `${host}${path}`).not.toMatch(/^<!doctype html|^<html/i);
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
    emittedAsset(landingDocument, 'css', '/_next/static/'),
    landingHost,
    'css'
  );
  await expectTextAsset(
    request,
    emittedAsset(landingDocument, 'javascript', '/_next/static/'),
    landingHost,
    'javascript'
  );

  const product = await request.get(origin, { headers: { Host: appHost } });
  expect(product.status()).toBe(200);
  const productDocument = await product.text();
  expect(productDocument).toContain('Authlane Dashboard');
  expect(productDocument).toContain('<div id="root"></div>');
  expect(productDocument).not.toContain('data-primary-cta="true"');
  const productCssPath = emittedAsset(productDocument, 'css', '/assets/');
  const productJavascriptPath = emittedAsset(productDocument, 'javascript', '/assets/');
  await expectTextAsset(request, productCssPath, appHost, 'css');
  await expectTextAsset(request, productJavascriptPath, appHost, 'javascript');

  const connect = await request.get(`${origin}/connect`, { headers: { Host: appHost } });
  expect(connect.status()).toBe(200);
  const connectDocument = await connect.text();
  expect(connectDocument).toContain('Authlane Widget');
  expect(connectDocument).toContain('<div id="root"></div>');
  await expectTextAsset(
    request,
    emittedAsset(connectDocument, 'css', '/connect/assets/'),
    appHost,
    'css'
  );
  await expectTextAsset(
    request,
    emittedAsset(connectDocument, 'javascript', '/connect/assets/'),
    appHost,
    'javascript'
  );

  const docs = await request.get(`${origin}/docs`, { headers: { Host: appHost } });
  expect(docs.status()).toBe(200);
  const docsDocument = await docs.text();
  expect(docsDocument).toContain('site-shell docs-shell');
  const docsCssPath = emittedAsset(docsDocument, 'css', '/_next/static/');
  const docsCss = await expectTextAsset(request, docsCssPath, appHost, 'css');
  await expectTextAsset(
    request,
    emittedAsset(docsDocument, 'javascript', '/_next/static/'),
    appHost,
    'javascript'
  );

  const fontPath = docsCss.match(/url\(["']?([^"')]+\.woff2(?:\?[^"')]+)?)/)?.[1];
  if (fontPath) {
    const resolvedFontPath = new URL(fontPath, `${origin}${docsCssPath}`).pathname;
    const font = await request.get(`${origin}${resolvedFontPath}`, { headers: { Host: appHost } });
    const body = await font.body();
    expect(font.status(), resolvedFontPath).toBe(200);
    expect(font.headers()['content-type'], resolvedFontPath).toBe('font/woff2');
    expect(body.subarray(0, 32).toString('utf8'), resolvedFontPath).not.toMatch(/<!doctype|<html/i);
  }

  for (const host of [landingHost, appHost]) {
    const icon = await request.get(`${origin}/icon.svg`, { headers: { Host: host } });
    expect(icon.status(), host).toBe(200);
    expect(icon.headers()['content-type'], host).toMatch(/^image\/svg\+xml\b/);
    expect((await icon.text()).trimStart(), host).toMatch(/^<svg\b/);
  }

  for (const path of ['/api/v1/catalog/services', '/connect', '/docs', productJavascriptPath]) {
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
