import { expect, test } from '@playwright/test';

const origin = process.env.E2E_SINGLE_RUNTIME_ORIGIN ?? 'http://127.0.0.1:3000';
const landingHost = 'authlane.io';
const appHost = 'app.authlane.io';

test('separates landing and product surfaces in one runtime', async ({ request }) => {
  const landing = await request.get(origin, { headers: { Host: landingHost } });
  expect(landing.status()).toBe(200);
  expect(await landing.text()).toContain('Connected tools. Your traffic.');

  const product = await request.get(origin, { headers: { Host: appHost } });
  expect(product.status()).toBe(200);
  const productDocument = await product.text();
  expect(productDocument).toContain('Authlane Dashboard');
  expect(productDocument).not.toContain('Connected tools. Your traffic.');

  const productAssetPath = productDocument.match(/(?:src|href)="(\/assets\/[^"]+)"/)?.[1];
  expect(productAssetPath).toBeTruthy();
  expect(
    (await request.get(`${origin}${productAssetPath}`, { headers: { Host: appHost } })).status()
  ).toBe(200);

  const connect = await request.get(`${origin}/connect`, { headers: { Host: appHost } });
  expect(connect.status()).toBe(200);
  expect(await connect.text()).toContain('Authlane Widget');

  const docs = await request.get(`${origin}/docs`, { headers: { Host: appHost } });
  expect(docs.status()).toBe(200);
  expect(await docs.text()).toContain('Build with Authlane');

  for (const path of [
    '/api/v1/catalog/services',
    '/connect',
    '/docs',
    productAssetPath as string,
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
    expect((await request.get(`${origin}/health`, { headers: { Host: host } })).status()).toBe(200);
  }
});
