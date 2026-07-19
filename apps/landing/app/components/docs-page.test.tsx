import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getDoc } from '../lib/docs';
import { CodeGroup, DocsCodeBlock } from './docs-code';
import { DocsNavigation, PreviousNext } from './docs-navigation';
import { Callout, DocsPage, PageActions, Steps } from './docs-page';

describe('documentation page components', () => {
  beforeAll(() => {
    vi.stubGlobal('React', React);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('renders copyable code with the original source and an accessible control', () => {
    const html = renderToStaticMarkup(
      <DocsCodeBlock language="typescript" source="const user = authlane.user('user_123');" />
    );
    expect(html).toContain('data-copy-code');
    expect(html).toContain('aria-label="Copy TypeScript code"');
    expect(html).toContain('data-copy-status');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain('const user');
  });

  it('escapes the original source in the copy data attribute', () => {
    const html = renderToStaticMarkup(
      <DocsCodeBlock language="typescript" source={'const value = "<safe>";'} />
    );

    expect(html).toContain('data-code-source="const value = &quot;&lt;safe&gt;&quot;;"');
    expect(html).not.toContain('data-code-source="const value = "<safe>";"');
  });

  it('renders an accessible code group with all panels available without JavaScript', () => {
    const html = renderToStaticMarkup(
      <CodeGroup
        labels={['TypeScript', 'Python']}
        languages={['typescript', 'python']}
        sources={['const ok = true;', 'ok = True']}
      />
    );
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
    expect(html).toContain('const ok = true;');
    expect(html).toContain('ok = True');
    expect(html).not.toContain('hidden=""');
  });

  it('preserves repository-owned CodeGroup expression props through MDX compilation', () => {
    const pageSource = readFileSync(resolve(process.cwd(), 'app/components/docs-page.tsx'), 'utf8');

    expect(pageSource).toContain('blockJS: false');
    expect(pageSource).toContain('blockDangerousJS: true');
  });

  it('rejects mismatched code group arrays', () => {
    expect(() =>
      renderToStaticMarkup(
        <CodeGroup
          labels={['TypeScript', 'Python']}
          languages={['typescript']}
          sources={['const ok = true;', 'ok = True']}
        />
      )
    ).toThrow('CodeGroup labels, languages, and sources must have equal lengths.');
  });

  it('renders semantic steps and labelled callout tones', () => {
    const steps = renderToStaticMarkup(
      <Steps>
        <li>Install the SDK.</li>
        <li>Initialize Authlane.</li>
      </Steps>
    );
    const callout = renderToStaticMarkup(
      <Callout tone="security">Keep tenant API keys on the server.</Callout>
    );

    expect(steps).toContain('<ol class="docs-prose-steps"');
    expect(steps.match(/<li>/g)).toHaveLength(2);
    expect(callout).toContain('class="docs-callout docs-callout--security"');
    expect(callout).toContain('aria-label="Security"');
    expect(callout).toContain('<strong>Security</strong>');
  });

  it('links page actions to the stable public Markdown asset', () => {
    const html = renderToStaticMarkup(<PageActions doc={getDoc('introduction')} />);

    expect(html).toContain('aria-label="Page actions"');
    expect(html).toContain('href="/docs/markdown/introduction.md"');
    expect(html).toContain('Open Markdown');
  });

  it('renders previous and next links in canonical documentation order', () => {
    const html = renderToStaticMarkup(<PreviousNext currentSlug="quickstart" />);

    expect(html).toContain('aria-label="Documentation pagination"');
    expect(html).toContain('href="/docs/introduction"');
    expect(html).toContain('href="/docs/concepts/how-authlane-works"');
    expect(html).toContain('Previous');
    expect(html).toContain('Next');
  });

  it('preserves list semantics after navigation style resets', () => {
    const navigation = renderToStaticMarkup(<DocsNavigation currentSlug="introduction" />);
    const page = renderToStaticMarkup(
      <DocsPage doc={getDoc('introduction')}>
        <p>Article body.</p>
      </DocsPage>
    );

    expect(navigation).toContain('<ul role="list">');
    expect(page).toContain('class="docs-breadcrumbs" aria-label="Breadcrumb"><ol role="list">');
    expect(page).toContain(
      '<aside class="docs-toc" aria-label="On this page"><h2>On this page</h2><ol role="list">'
    );
  });

  it('renders global search as static accessible dialog markup', () => {
    const page = renderToStaticMarkup(
      <DocsPage doc={getDoc('introduction')}>
        <p>Article body.</p>
      </DocsPage>
    );

    expect(page).toContain('data-docs-search-open="true"');
    expect(page).toContain('aria-keyshortcuts="Meta+K Control+K"');
    expect(page).toContain('<kbd>⌘K</kbd>');
    expect(page).toContain(
      '<dialog id="docs-search" class="docs-search__dialog" aria-labelledby="docs-search-title">'
    );
    expect(page).toContain('type="search"');
    expect(page).toContain('name="docs-search"');
    expect(page).toContain('data-docs-search-input="true"');
    expect(page).toContain('data-docs-search-results="true" aria-live="polite"');
    expect(page).toContain('data-docs-search-close="true"');
  });

  it('places page actions and adjacency after the article body', () => {
    const html = renderToStaticMarkup(
      <DocsPage doc={getDoc('introduction')}>
        <p>Article body marker.</p>
      </DocsPage>
    );

    const bodyIndex = html.indexOf('Article body marker.');
    const actionsIndex = html.indexOf('aria-label="Page actions"');
    const adjacencyIndex = html.indexOf('aria-label="Documentation pagination"');
    expect(bodyIndex).toBeGreaterThan(-1);
    expect(actionsIndex).toBeGreaterThan(bodyIndex);
    expect(adjacencyIndex).toBeGreaterThan(actionsIndex);
  });

  it('does not publish a missing Markdown action for non-MDX shell pages', () => {
    const html = renderToStaticMarkup(
      <DocsPage
        doc={{
          slug: 'api-reference',
          title: 'API reference',
          description: 'Read-only API reference.',
          source: '',
          headings: [],
          navigationGroup: 'API Documentation',
        }}
      >
        <p>Generated reference body.</p>
      </DocsPage>
    );

    expect(html).not.toContain('href="/docs/markdown/api-reference.md"');
    expect(html).not.toContain('aria-label="Page actions"');
  });

  it('styles the docs shell with muted surfaces and responsive touch targets', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');
    const page = renderToStaticMarkup(
      <DocsPage doc={getDoc('introduction')}>
        <p>Article body.</p>
      </DocsPage>
    );

    expect(css).toMatch(/\.docs-code-shell\s*{/);
    expect(css).toMatch(/\.docs-prose-steps\s*{/);
    expect(css).toMatch(/\.docs-page-actions\s*{/);
    expect(css).toMatch(/\.docs-pagination\s*{/);
    expect(css).toMatch(/\.docs-nav a\[aria-current='page'\]\s*{[^}]*background:[^}]*}/);
    expect(css).not.toMatch(/\.docs-nav a\[aria-current='page'\]\s*{[^}]*box-shadow:[^}]*}/);
    expect(css).toMatch(
      /@media \(max-width: 68rem\)[\s\S]*\.docs-code-copy,[\s\S]*min-height: 3rem;/
    );
    expect(page).toContain('class="mono eyebrow docs-article__eyebrow">Documentation</p>');
    expect(css).toMatch(/\.docs-article__eyebrow\s*{[^}]*text-transform: none;[^}]*}/);
  });
});
