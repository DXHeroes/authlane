import { describe, expect, it } from 'vitest';
import { SERVICE_ICON_ETAG, SERVICE_ICON_SVG } from '../../src/generated/service-icons.js';
import { createServiceIconsRouter } from '../../src/routes/service-icons.js';

const router = createServiceIconsRouter();

const get = (path: string, headers?: Record<string, string>) =>
  router.request(new Request(`http://app.authlane.local${path}`, { headers }));

describe('service icon route', () => {
  it('serves a mark to an <img> that carries no credentials', async () => {
    const response = await get('/github.svg');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml; charset=utf-8');
    expect(await response.text()).toBe(SERVICE_ICON_SVG.github);
  });

  it('lets a card revalidate instead of refetching', async () => {
    const first = await get('/github.svg');
    const etag = first.headers.get('ETag');

    expect(etag).toBe(SERVICE_ICON_ETAG.github);

    const second = await get('/github.svg', { 'If-None-Match': etag as string });

    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
  });

  it('caches for a day, not forever, because the URL carries no content hash', async () => {
    // An immutable year would make a corrected mark invisible until the cache expired.
    const response = await get('/github.svg');

    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=86400, stale-while-revalidate=604800'
    );
  });

  it('serves the mark as inert markup', async () => {
    const response = await get('/github.svg');

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Security-Policy')).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; sandbox"
    );
  });

  it('answers a missing icon with JSON, never the SPA document', async () => {
    // The catch-all one level up serves index.html for anything unmatched. If this route did not
    // answer first, a typo would return 200 and an HTML page, the image would fail silently, and
    // nothing would say why.
    const response = await get('/nope.svg');

    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('refuses anything that is not a service id and an svg', async () => {
    for (const path of [
      '/github.png',
      '/..%2f..%2fetc%2fpasswd',
      '/GitHub.svg',
      '/github.svg.txt',
      '/.svg',
    ]) {
      expect((await get(path)).status).toBe(404);
    }
  });

  it('answers for a service that ships no mark, so the consumer falls back deliberately', async () => {
    // Slack, Salesforce, and the Microsoft services are not in the CC0 set. They render from their
    // brand colour and initials, and this 404 is the signal to do so.
    expect(SERVICE_ICON_SVG.slack).toBeUndefined();
    expect((await get('/slack.svg')).status).toBe(404);
  });
});
