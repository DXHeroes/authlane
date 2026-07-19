import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { getAllDocs } from '../lib/docs';
import robots from '../robots';
import sitemap from '../sitemap';
import { generateStaticParams } from './[...slug]/page';
import ApiReferencePage from './api-reference/page';

const landingRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repositoryRoot = resolve(landingRoot, '../..');

describe('documentation publication contract', () => {
  it('publishes current byte-identical YAML and stable JSON assets', () => {
    const canonical = readFileSync(
      resolve(repositoryRoot, 'apps/docs/api-reference/openapi.yaml'),
      'utf8'
    );
    const yamlAsset = readFileSync(resolve(landingRoot, 'public/docs/openapi.yaml'), 'utf8');
    const jsonAsset = readFileSync(resolve(landingRoot, 'public/docs/openapi.json'), 'utf8');

    expect(yamlAsset).toBe(canonical);
    expect(JSON.parse(jsonAsset)).toMatchObject({ openapi: '3.1.0' });
    expect(jsonAsset.endsWith('\n')).toBe(true);
  });

  it('keeps the API viewer route-local, read-only, and backed by the canonical manifest', () => {
    const viewer = readFileSync(resolve(landingRoot, 'app/docs/api-reference/page.tsx'), 'utf8');
    const client = readFileSync(
      resolve(landingRoot, 'app/docs/api-reference/api-reference-client.tsx'),
      'utf8'
    );
    const styles = readFileSync(resolve(landingRoot, 'app/globals.css'), 'utf8');

    expect(viewer).not.toMatch(/<(?:form|input|textarea)\b/i);
    expect(viewer).not.toMatch(/\b(?:fetch|XMLHttpRequest)\s*\(/);
    expect(viewer).toContain("getDoc('api-reference')");
    expect(viewer).not.toContain('const doc: DocRecord');
    expect(viewer).toContain(
      'Read-only API reference. Never paste an Authlane API key into browser tools.'
    );
    expect(viewer).toContain('OpenAPI YAML');
    expect(viewer).toContain('OpenAPI JSON');
    expect(viewer).toContain('<a href="/docs/openapi.yaml">');
    expect(viewer).toContain('<a href="/docs/openapi.json">');
    expect(viewer).not.toContain('<Link href="/docs/openapi.');
    expect(viewer).toContain('ApiReferenceClient');
    expect(client).toContain("'use client'");
    expect(client).toContain('@scalar/api-reference-react/style.css');
    expect(client).toContain('observeReadOnlyApiReference(document.body)');
    expect(styles).toMatch(
      /\.authlane-api-reference\s+\.security-requirement-badge\s*\{[^}]*display:\s*none\s*!important;/
    );
    expect(styles).not.toContain('.scalar-mcp-layer');
  });

  it('keeps the explicit API viewer out of catch-all static generation', () => {
    const params = generateStaticParams();
    expect(params).toHaveLength(getAllDocs().length - 2);
    expect(params).not.toContainEqual({ slug: ['introduction'] });
    expect(params).not.toContainEqual({ slug: ['api-reference'] });
  });

  it('uses one canonical public-route helper for every manifest-backed surface', () => {
    const routeConsumers = [
      'app/components/docs-navigation.tsx',
      'app/docs/[...slug]/page.tsx',
      'app/docs/api-reference/page.tsx',
      'app/docs/page.tsx',
      'app/sitemap.ts',
    ];

    for (const relativePath of routeConsumers) {
      const source = readFileSync(resolve(landingRoot, relativePath), 'utf8');
      expect(source, relativePath).toMatch(/getPublicDoc(?:Path|Url)/);
      expect(source, relativePath).not.toContain("slug === 'introduction'");
    }

    const generator = readFileSync(resolve(repositoryRoot, 'scripts/docs-content.mjs'), 'utf8');
    expect(generator).toContain('getPublicDocPath');
    expect(generator).toContain('getPublicDocUrl');
  });

  it('renders a server fallback and read-only warning into static HTML', () => {
    vi.stubGlobal('React', React);
    const html = renderToStaticMarkup(ApiReferencePage());
    vi.unstubAllGlobals();

    expect(html).toContain(
      'Read-only API reference. Never paste an Authlane API key into browser tools.'
    );
    expect(html).toContain('OpenAPI YAML');
    expect(html).toContain('OpenAPI JSON');
    expect(html).toContain('Loading the interactive API reference');
  });

  it('allows docs crawling and lists all MDX routes in the sitemap', () => {
    const robotsRoute = JSON.stringify(robots());
    const sitemapUrls = sitemap().map((entry) => entry.url.replace(/\/$/, ''));
    const expectedDocsUrls = getAllDocs().map((doc) =>
      doc.slug === 'introduction'
        ? 'https://authlane.io/docs'
        : `https://authlane.io/docs/${doc.slug}`
    );

    expect(robotsRoute).not.toContain('/docs/');
    expect(new Set(sitemapUrls).size).toBe(sitemapUrls.length);
    expect(sitemapUrls).not.toContain('https://authlane.io/docs/introduction');
    for (const url of expectedDocsUrls) {
      expect(sitemapUrls.filter((candidate) => candidate === url)).toHaveLength(1);
    }
  });
});
