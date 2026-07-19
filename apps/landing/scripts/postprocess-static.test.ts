import { describe, expect, it } from 'vitest';
import {
  makeStaticDocument,
  scalarHydrationAssets,
  staticDocumentViolations,
} from './postprocess-static.mjs';

const interactionScript = '/_next/static/authlane-interactions-0123456789ab.js';

function scalarDocumentWithRuntime(runtimeSource: string) {
  return `<body>
    <script src="${runtimeSource}"></script>
    <script src="/_next/static/authlane-next-flight-0123456789ab.js"></script>
    <script type="module" src="${interactionScript}" defer></script>
  </body>`;
}

describe('landing static export post-processing', () => {
  it('removes Next hydration resources and preserves non-executable structured data', () => {
    const html = `<!doctype html><html><head>
      <link rel="preload" as="script" href="/_next/static/chunks/webpack.js">
      <script src="/_next/static/chunks/app.js" async></script>
      <script type="application/ld+json">{"name":"Authlane"}</script>
    </head><body><main>Authlane</main>
      <script>(self.__next_f=self.__next_f||[]).push([0])</script>
      <script>self.__next_f.push([1,"payload"])</script>
    </body></html>`;

    const document = makeStaticDocument(html, interactionScript, 'static');

    expect(document).not.toContain('webpack.js');
    expect(document).not.toContain('chunks/app.js');
    expect(document).not.toContain('__next_f');
    expect(document).toContain('<script type="application/ld+json">{"name":"Authlane"}</script>');
    expect(staticDocumentViolations(document, 'static')).toEqual([]);
  });

  it('rejects inline executable code and non-fingerprinted interaction assets', () => {
    const document = `<!doctype html><body><script>alert('unexpected')</script>
      <script type="module" src="/_next/static/authlane-interactions.js" defer></script></body>`;

    expect(staticDocumentViolations(document, 'static')).toEqual([
      'contains executable inline script',
      'interaction script is not a deferred fingerprinted same-origin module',
    ]);
  });

  it('externalizes Scalar hydration in place while ordinary pages remain runtime-free', () => {
    const html = `<body>
      <script src="/_next/static/chunks/app-0123456789abcdef.js"></script>
      <script>(self.__next_f=self.__next_f||[]).push([0])</script>
      <main>API reference</main>
      <script>self.__next_f.push([1,"payload"])</script>
    </body>`;
    const assets = scalarHydrationAssets(html);
    const scalar = makeStaticDocument(html, interactionScript, 'scalar');
    const ordinary = makeStaticDocument(html, interactionScript, 'static');

    expect(assets).toHaveLength(2);
    expect(assets.map(({ source }) => source)).toEqual([
      '(self.__next_f=self.__next_f||[]).push([0])',
      'self.__next_f.push([1,"payload"])',
    ]);
    expect(assets.every(({ publicPath }) => scalar.includes(`src="${publicPath}"`))).toBe(true);
    expect(scalar.indexOf(assets[0].publicPath)).toBeLessThan(scalar.indexOf('<main>'));
    expect(scalar.indexOf(assets[1].publicPath)).toBeGreaterThan(scalar.indexOf('<main>'));
    expect(scalar).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>\s*(?:\(self|self)\.__next_f/);
    expect(scalar).toContain('/_next/static/chunks/app-0123456789abcdef.js');
    expect(ordinary).not.toContain('/_next/static/chunks/app-0123456789abcdef.js');
    expect(ordinary).not.toContain('__next_f');
    expect(staticDocumentViolations(scalar, 'scalar')).toEqual([]);
    expect(staticDocumentViolations(ordinary, 'static')).toEqual([]);
  });

  it('produces only fingerprinted same-origin executable scripts for the Scalar route CSP', () => {
    const html = `<body>
      <script src="/_next/static/chunks/webpack-fedcba9876543210.js"></script>
      <script>(self.__next_f=self.__next_f||[]).push([0])</script>
      <script>self.__next_f.push([1,"payload"])</script>
    </body>`;

    const document = makeStaticDocument(html, interactionScript, 'scalar');
    const scripts = [...document.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];

    expect(scripts).toHaveLength(4);
    for (const [, attributes, content] of scripts) {
      expect(content.trim()).toBe('');
      expect(attributes).toMatch(/\bsrc="\/_next\/static\//);
      expect(attributes).toMatch(/[a-f0-9]{12,16}\.js"/);
    }
    expect(staticDocumentViolations(document, 'scalar')).toEqual([]);
  });

  it.each([
    '/_next/static/chunks/../outside-0123456789abcdef.js',
    '/_next/static/chunks/./runtime-0123456789abcdef.js',
    '/_next/static/chunks/%2e%2e/outside-0123456789abcdef.js',
    '/_next/static/chunks/%2E%2e/outside-0123456789abcdef.js',
    '/_next/static/chunks/.%2E/outside-0123456789abcdef.js',
    '/_next/static/chunks/nested%2f..%2foutside-0123456789abcdef.js',
    '/_next/static/chunks/nested%2F..%2Foutside-0123456789abcdef.js',
    '/_next/static/chunks/nested%5c..%5coutside-0123456789abcdef.js',
    '/_next/static/chunks/nested\\..\\outside-0123456789abcdef.js',
    '/_next/static/chunks/%252e%252e/outside-0123456789abcdef.js',
    '/_next/static/chunks/runtime-0123456789abcdef.js?cache=1',
    '/_next/static/chunks/runtime-0123456789abcdef.js#fragment',
  ])('rejects traversal-shaped or ambiguous Next runtime source %s', (runtimeSource) => {
    expect(staticDocumentViolations(scalarDocumentWithRuntime(runtimeSource), 'scalar')).toContain(
      `contains an unexpected or non-fingerprinted Next script: ${runtimeSource}`
    );
  });

  it.each([
    'https://authlane.io/_next/static/chunks/runtime-0123456789abcdef.js',
    '//authlane.io/_next/static/chunks/runtime-0123456789abcdef.js',
  ])('rejects non-absolute-path Next runtime source %s', (runtimeSource) => {
    expect(staticDocumentViolations(scalarDocumentWithRuntime(runtimeSource), 'scalar')).toContain(
      `contains an unexpected external script: ${runtimeSource}`
    );
  });

  it.each([
    '/_next/static/chunks/app/docs/api-reference/page-0123456789abcdef.js',
    '/_next/static/chunks/app/docs/[...slug]/page-fedcba9876543210.js',
    '/_next/static/chunks/8fa6df74.82fd7b6f910e4836.js',
  ])('accepts valid nested fingerprinted Next runtime source %s', (runtimeSource) => {
    expect(staticDocumentViolations(scalarDocumentWithRuntime(runtimeSource), 'scalar')).toEqual(
      []
    );
  });

  it('rejects malicious inline code even when it contains a Next flight push', () => {
    const html = `<body>
      <script>alert('malicious');self.__next_f.push([1,"payload"])</script>
    </body>`;
    const document = makeStaticDocument(html, interactionScript, 'scalar');

    expect(scalarHydrationAssets(html)).toEqual([]);
    expect(document).toContain("alert('malicious')");
    expect(staticDocumentViolations(document, 'scalar')).toContain(
      'contains executable inline script'
    );
  });
});
