import { describe, expect, it } from 'vitest';
import {
  makeStaticDocument,
  scalarHydrationAssets,
  staticDocumentViolations,
} from './postprocess-static.mjs';

const interactionScript = '/_next/static/authlane-interactions-0123456789ab.js';

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
