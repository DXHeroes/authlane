import { describe, expect, it } from 'vitest';
import { makeStaticDocument, staticDocumentViolations } from './postprocess-static.mjs';

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

    const document = makeStaticDocument(
      html,
      '/_next/static/authlane-interactions-0123456789ab.js',
      'static'
    );

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

  it('preserves Next hydration only for the Scalar route', () => {
    const html = '<body><script src="/_next/static/chunks/app.js"></script></body>';
    const scalar = makeStaticDocument(
      html,
      '/_next/static/authlane-interactions-0123456789ab.js',
      'scalar'
    );
    const ordinary = makeStaticDocument(
      html,
      '/_next/static/authlane-interactions-0123456789ab.js',
      'static'
    );
    expect(scalar).toContain('/_next/static/chunks/app.js');
    expect(ordinary).not.toContain('/_next/static/chunks/app.js');
    expect(staticDocumentViolations(scalar, 'scalar')).toEqual([]);
    expect(staticDocumentViolations(ordinary, 'static')).toEqual([]);
  });
});
