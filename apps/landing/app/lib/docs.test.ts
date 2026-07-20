import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getAdjacentDocs, getAllDocs, getDoc, getDocsNavigation } from './docs';

const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs');

function sourceSlugs(): string[] {
  return readdirSync(docsRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mdx'))
    .map((entry) => relative(docsRoot, resolve(entry.parentPath, entry.name)).replace(/\.mdx$/, ''))
    .sort();
}

describe('build-time documentation source', () => {
  it('reads documentation records from the generated manifest without runtime filesystem parsing', () => {
    const moduleSource = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), 'docs.ts'),
      'utf8'
    );

    expect(moduleSource).toContain('../generated/docs-manifest.json');
    expect(moduleSource).not.toContain("from 'node:fs'");
    expect(moduleSource).not.toContain("from 'yaml'");
  });

  it('resolves previous and next pages from one canonical navigation order', () => {
    const docs = getAllDocs();
    expect(getAdjacentDocs(docs[0].slug)).toEqual({ previous: null, next: docs[1] });
    expect(getAdjacentDocs(docs[docs.length - 1].slug)).toEqual({
      previous: docs.at(-2),
      next: null,
    });
  });

  it('returns group metadata with every documentation record', () => {
    const firstGroup = getDocsNavigation()[0];
    expect(firstGroup).toMatchObject({ group: expect.any(String) });
    expect(firstGroup.docs[0]).toMatchObject({
      slug: expect.any(String),
      navigationGroup: firstGroup.group,
    });
    expect(getDoc(firstGroup.docs[0].slug).navigationGroup).toBe(firstGroup.group);
  });

  it('publishes the approved task-oriented navigation groups in order', () => {
    expect(getDocsNavigation().map((group) => group.group)).toEqual([
      'Start here',
      'Build',
      'SDKs and frameworks',
      'API reference',
      'Integrations',
      'Extend Authlane',
      'Operate',
      'AI coding tools',
    ]);
    expect(
      getDocsNavigation()
        .find((group) => group.group === 'API reference')
        ?.pages.at(-1)
    ).toBe('api-reference');
  });

  it('publishes complete framework and AI coding tool pages', () => {
    for (const slug of [
      'sdk/vercel-ai',
      'sdk/openai-agents',
      'sdk/mastra',
      'sdk/agno',
      'sdk/langchain',
      'sdk/local-mcp',
      'ai-tools/claude',
      'ai-tools/codex',
      'ai-tools/cursor',
    ]) {
      expect(getDoc(slug).source.length).toBeGreaterThan(400);
    }
  });

  it('keeps Mint navigation in exact equality with every MDX source', () => {
    const sources = sourceSlugs();
    const loaded = getAllDocs()
      .map((doc) => doc.slug)
      .sort();
    const navigation = getDocsNavigation()
      .flatMap((group) => group.pages)
      .sort();

    expect(sources).toHaveLength(59);
    expect(loaded).toEqual(sources);
    expect(navigation).toEqual(sources);
  });

  it('does not publish broken internal Markdown links', () => {
    const knownRoutes = new Set([
      ...sourceSlugs(),
      'api-reference',
      'openapi.json',
      'openapi.yaml',
    ]);
    const broken: string[] = [];

    for (const doc of getAllDocs()) {
      const source = readFileSync(resolve(docsRoot, `${doc.slug}.mdx`), 'utf8');
      for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        const href = match[1].split('#')[0];
        if (!href || /^(?:https?:|mailto:)/.test(href)) continue;
        const slug = href
          .replace(/^\/docs\/?/, '')
          .replace(/^\//, '')
          .replace(/\/$/, '');
        if (!knownRoutes.has(slug) && !existsSync(resolve(docsRoot, `${slug}.mdx`))) {
          broken.push(`${doc.slug}: ${href}`);
        }
      }
    }

    expect(broken).toEqual([]);
  });
});
