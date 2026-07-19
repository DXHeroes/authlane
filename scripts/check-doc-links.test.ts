import { describe, expect, it, vi } from 'vitest';
import * as awaitableExports from './check-doc-links.mjs';
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
    const urls = (
      extractPublicHttpUrls as (sources: string[], configuration?: unknown) => string[]
    )(
      [
        [
          '[Docs](https://authlane.io/docs) and [duplicate](https://authlane.io/docs).',
          '<https://authlane.io/docs/quickstart>',
          '<a href="https://authlane.io/docs/api-reference">Reference</a>',
          'Bare literals are examples, not links: https://not-a-link.authlane.io.',
          '`[Inline code](https://inline-code.authlane.io)`',
          '```bash',
          'curl https://code-example.authlane.io',
          '```',
          '[Token](https://authlane.io/connect?token=secret)',
          '[Code](https://authlane.io/connect?code=value)',
          '[State](https://authlane.io/connect?state=value)',
          '[Secret](https://authlane.io/connect?client_secret=value)',
          '[Key](https://authlane.io/connect?api_key=value)',
          '<https://authlane.io/oauth/github/callback?status=connected>',
          '<https://authlane.io/verify-email>',
          '<https://authlane.io/reset-password>',
          '<https://authlane.io/invite>',
          '<https://authlane.io/userinfo>',
          '[URL userinfo](https://user:password@authlane.io/docs)',
          '<https://authlane.io/path#session=secret>',
          'http://localhost:3000 and https://api.example.com',
        ].join('\n'),
      ],
      {
        topbarCtaButton: { url: 'https://app.authlane.io' },
        topbarLinks: [{ url: 'mailto:support@authlane.io' }],
        anchors: [{ url: 'https://github.com/dxheroes/authlane' }],
        footerSocials: { github: 'https://github.com/dxheroes/authlane' },
        ignored: { value: 'https://ignored.authlane.io' },
      }
    );

    expect(urls).toEqual([
      'https://app.authlane.io/',
      'https://authlane.io/docs',
      'https://authlane.io/docs/api-reference',
      'https://authlane.io/docs/quickstart',
      'https://github.com/dxheroes/authlane',
    ]);
  });

  it('fails the CLI decision when extraction yields no public targets', () => {
    const helper = (
      awaitableExports as unknown as {
        linkCheckExitCode?: (urls: string[], results: unknown[]) => number;
      }
    ).linkCheckExitCode;
    expect(helper).toBeTypeOf('function');
    if (!helper) return;
    expect(helper([], [])).toBe(1);
    expect(helper(['https://authlane.io/docs'], [])).toBe(1);
    expect(
      helper(
        ['https://authlane.io/docs'],
        [
          {
            originalUrl: 'https://authlane.io/docs',
            finalUrl: 'https://authlane.io/docs',
            status: 200,
            error: null,
          },
        ]
      )
    ).toBe(0);
  });

  it('explicitly excludes generated, dependency, cache, fixture, and test-result directories', () => {
    const helper = (
      awaitableExports as unknown as { isExcludedSourceDirectory?: (name: string) => boolean }
    ).isExcludedSourceDirectory;
    expect(helper).toBeTypeOf('function');
    if (!helper) return;
    for (const directory of [
      'node_modules',
      'dist',
      'build',
      'out',
      '.next',
      '.mintlify',
      'cache',
      'fixtures',
      'test-results',
    ]) {
      expect(helper(directory)).toBe(true);
    }
    expect(helper('guides')).toBe(false);
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
