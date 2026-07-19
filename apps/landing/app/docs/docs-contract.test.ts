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

  it('keeps the API viewer read-only and build-highlighted', () => {
    const viewer = readFileSync(resolve(landingRoot, 'app/docs/api-reference/page.tsx'), 'utf8');

    expect(viewer).not.toMatch(/<(?:form|input|textarea)\b/i);
    expect(viewer).not.toMatch(/\b(?:fetch|XMLHttpRequest)\s*\(/);
    expect(viewer).not.toMatch(/try it/i);
    expect(viewer).toContain("highlightCode(code, 'json')");
    expect(viewer).toContain('<details');
    expect(viewer).toContain('Request example');
    expect(viewer).toContain('Response example');
    expect(viewer).toContain('Webhook example');
  });

  it('keeps the explicit API viewer out of catch-all static generation', () => {
    const params = generateStaticParams();
    expect(params).toHaveLength(getAllDocs().length - 1);
    expect(params).not.toContainEqual({ slug: ['api-reference'] });
  });

  it('renders resolved operation and webhook examples into static HTML', () => {
    vi.stubGlobal('React', React);
    const html = renderToStaticMarkup(ApiReferencePage());
    vi.unstubAllGlobals();

    expect(html).toContain('Request example');
    expect(html).toContain('Response example');
    expect(html).toContain('Webhook example');
    expect(html).toContain('user_123');
    expect(html).toContain('github_create_issue');
    expect(html).toContain('connection.connected');
  });

  it('allows docs crawling and lists all MDX routes in the sitemap', () => {
    const robotsRoute = JSON.stringify(robots());
    const sitemapUrls = new Set(sitemap().map((entry) => entry.url.replace(/\/$/, '')));

    expect(robotsRoute).not.toContain('/docs/');
    expect(sitemapUrls).toContain('https://authlane.io/docs');
    expect(sitemapUrls).toContain('https://authlane.io/docs/api-reference');
    for (const doc of getAllDocs()) {
      expect(sitemapUrls).toContain(`https://authlane.io/docs/${doc.slug}`);
    }
  });
});
