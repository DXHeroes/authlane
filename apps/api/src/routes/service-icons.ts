/**
 * The service marks Authlane serves, so a consuming application renders no logo it has to host.
 *
 * Deliberately outside `/api/v1`: everything under that prefix goes through `authMiddleware`, and
 * an `<img>` element carries no Authorization header. The path is unauthenticated because a mark is
 * public by nature — the only thing it reveals is which providers Authlane integrates, which the
 * documentation already lists.
 */

import { Errors } from '@authlane/shared';
import { Hono } from 'hono';
import { SERVICE_ICON_ETAG, SERVICE_ICON_SVG } from '../generated/service-icons.js';
import { errorResult } from '../lib/api-response.js';

/**
 * A day rather than a year, because the URL carries no content hash.
 *
 * Vite-built assets are served `immutable` one level up, and correctly: their filenames change with
 * their contents. These do not, so a corrected mark would stay invisible for as long as the max-age
 * says. A day plus revalidation gives the same practical hit rate with a bounded correction window.
 */
const CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800';

/** Reject before the lookup, so no traversal or alternate extension ever reaches the map. */
const ICON_FILE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.svg$/;

export function createServiceIconsRouter() {
  const router = new Hono();

  router.get('/:file', (c) => {
    const file = c.req.param('file');

    if (!ICON_FILE.test(file)) {
      return c.json(errorResult(Errors.notFound('Service icon', file)), 404);
    }

    const serviceId = file.slice(0, -'.svg'.length);
    const svg = SERVICE_ICON_SVG[serviceId];

    if (!svg) {
      // Explicit, because the SPA catch-all would otherwise answer this with 200 and an HTML
      // document. The image would fail silently and nothing in the logs would say why.
      return c.json(errorResult(Errors.notFound('Service icon', serviceId)), 404);
    }

    const etag = SERVICE_ICON_ETAG[serviceId];

    if (etag && c.req.header('If-None-Match') === etag) {
      c.header('Cache-Control', CACHE_CONTROL);
      c.header('ETag', etag);
      return c.body(null, 304);
    }

    c.header('Content-Type', 'image/svg+xml; charset=utf-8');
    c.header('Cache-Control', CACHE_CONTROL);
    if (etag) c.header('ETag', etag);
    c.header('X-Content-Type-Options', 'nosniff');
    // An SVG served from this origin is same-origin markup and could otherwise run script. The
    // generator already refuses anything executable; this is the second lock on the same door.
    c.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    return c.body(svg);
  });

  return router;
}
