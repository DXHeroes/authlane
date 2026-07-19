import { describe, expect, it, vi } from 'vitest';
import {
  checkPublicUrl,
  checkPublicUrls,
  extractPublicHttpUrls,
  formatLinkResult,
} from './check-doc-links.mjs';

function response(status: number, url: string) {
  return { status, url } as Response;
}

describe('public documentation link smoke', () => {
  it('extracts sorted unique public HTTP links and skips placeholders and non-public schemes', () => {
    const urls = extractPublicHttpUrls([
      '[Docs](https://authlane.io/docs) and https://authlane.io/docs.',
      'https://app.authlane.io/path?q=one mailto:team@authlane.io /docs/quickstart',
      'http://localhost:3000 https://api.example.com https://example.org/example',
      'https://app.authlane.io/api/v1/catalog/services',
      'https://app.authlane.io/api/v1/oauth/{serviceId}/callback',
      'https://authlane.io/docs/** https://app.authlane.io/connect#session=acs_redacted',
    ]);

    expect(urls).toEqual(['https://app.authlane.io/path?q=one', 'https://authlane.io/docs']);
  });

  it('falls back from an unsuitable HEAD response to GET without credentials', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(405, 'https://authlane.io/docs'))
      .mockResolvedValueOnce(response(200, 'https://authlane.io/docs/quickstart'));

    const result = await checkPublicUrl('https://authlane.io/docs', {
      fetchImpl,
      timeoutMs: 100,
    });

    expect(result).toEqual({
      originalUrl: 'https://authlane.io/docs',
      finalUrl: 'https://authlane.io/docs/quickstart',
      status: 200,
      error: null,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.map(([, init]) => init)).toEqual([
      expect.objectContaining({ method: 'HEAD', redirect: 'follow' }),
      expect.objectContaining({ method: 'GET', redirect: 'follow' }),
    ]);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init).not.toHaveProperty('headers');
      expect(init).not.toHaveProperty('credentials');
    }
  });

  it('retries transient failures at most twice and does not retry a final 404', async () => {
    const transientFetch = vi
      .fn()
      .mockResolvedValueOnce(response(503, 'https://authlane.io/docs'))
      .mockResolvedValueOnce(response(503, 'https://authlane.io/docs'));
    const missingFetch = vi.fn().mockResolvedValue(response(404, 'https://authlane.io/missing'));

    expect(
      await checkPublicUrl('https://authlane.io/docs', {
        fetchImpl: transientFetch,
        timeoutMs: 100,
      })
    ).toMatchObject({ status: 503 });
    expect(transientFetch).toHaveBeenCalledTimes(2);
    expect(
      await checkPublicUrl('https://authlane.io/missing', {
        fetchImpl: missingFetch,
        timeoutMs: 100,
      })
    ).toMatchObject({ status: 404 });
    expect(missingFetch).toHaveBeenCalledTimes(1);

    const overConfiguredFetch = vi
      .fn()
      .mockResolvedValue(response(503, 'https://authlane.io/docs'));
    await checkPublicUrl('https://authlane.io/docs', {
      fetchImpl: overConfiguredFetch,
      timeoutMs: 100,
      maxAttempts: 99,
    });
    expect(overConfiguredFetch).toHaveBeenCalledTimes(2);

    for (const maxAttempts of [0, Number.NaN, 1.5]) {
      const invalidAttemptFetch = vi
        .fn()
        .mockResolvedValue(response(503, 'https://authlane.io/docs'));
      await checkPublicUrl('https://authlane.io/docs', {
        fetchImpl: invalidAttemptFetch,
        timeoutMs: 100,
        maxAttempts,
      });
      expect(invalidAttemptFetch).toHaveBeenCalledTimes(2);
    }
  });

  it('bounds concurrency at four and reports original URL, final URL, and status', async () => {
    let active = 0;
    let peak = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return response(200, `${url}/final`);
    });
    const urls = Array.from({ length: 9 }, (_, index) => `https://authlane.io/${index}`);

    const results = await checkPublicUrls(urls, { fetchImpl, timeoutMs: 100, concurrency: 99 });

    expect(peak).toBe(4);
    expect(results).toHaveLength(9);
    expect(formatLinkResult(results[0])).toBe(
      'https://authlane.io/0 -> https://authlane.io/0/final [200]'
    );

    for (const concurrency of [0, Number.NaN, 1.5]) {
      active = 0;
      peak = 0;
      await checkPublicUrls(urls, { fetchImpl, timeoutMs: 100, concurrency });
      expect(peak).toBe(4);
    }
  });

  it('caps timeouts at ten seconds and replaces invalid values', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetchImpl = vi.fn().mockResolvedValue(response(200, 'https://authlane.io/docs'));

    try {
      for (const timeoutMs of [99_000, 0, Number.NaN, 250]) {
        await checkPublicUrl('https://authlane.io/docs', { fetchImpl, timeoutMs });
      }

      expect(timeout.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([
        10_000, 10_000, 10_000, 250,
      ]);
    } finally {
      timeout.mockRestore();
    }
  });
});
