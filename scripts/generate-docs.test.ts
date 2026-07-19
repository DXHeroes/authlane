import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildDocumentationModel,
  loadDocumentation,
  renderGeneratedAssets,
  validateDocumentation,
} from './docs-content.mjs';

describe('documentation asset generation', () => {
  const temporaryDirectories: string[] = [];
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('emits deterministic manifest, search, Markdown, and LLM assets', async () => {
    const model = buildDocumentationModel({
      navigation: [{ group: 'Start here', pages: ['introduction'] }],
      documents: [
        {
          slug: 'introduction',
          source:
            '---\ntitle: Introduction\ndescription: Start here.\n---\n\n## Boundary\n\nProvider traffic stays direct.\n',
        },
      ],
    });
    const first = renderGeneratedAssets(model);
    const second = renderGeneratedAssets(model);
    expect(second).toEqual(first);
    expect(JSON.parse(first.manifest).documents[0]).toMatchObject({
      slug: 'introduction',
      navigationGroup: 'Start here',
    });
    expect(JSON.parse(first.searchIndex)[0].text).toContain('Provider traffic stays direct');
    expect(first.markdown.get('introduction')).toContain('## Boundary');
    expect(first.llms).toContain('https://authlane.io/docs');
    expect(first.llmsFull).toContain('Provider traffic stays direct');
  });

  it('reports duplicate navigation, missing frontmatter, and unknown code languages', () => {
    const result = validateDocumentation({
      navigation: [{ group: 'Start', pages: ['broken', 'broken'] }],
      documents: [{ slug: 'broken', source: '```mystery\nvalue\n```' }],
    });
    expect(result).toEqual(
      expect.arrayContaining([
        expect.stringContaining('duplicate navigation slug: broken'),
        expect.stringContaining('missing frontmatter title: broken'),
        expect.stringContaining('unknown code fence language "mystery": broken'),
      ])
    );
  });

  it('normalizes public Markdown without changing fenced code', () => {
    const model = buildDocumentationModel({
      navigation: [{ group: 'Start', pages: ['quickstart'] }],
      documents: [
        {
          slug: 'quickstart',
          source: [
            '---',
            'title: Quickstart',
            'description: Start safely.',
            '---',
            '',
            '<Warning>',
            '  Keep credentials on the server.',
            '</Warning>',
            '',
            '<Tabs>',
            'Visible instructions.',
            '</Tabs>',
            '',
            '<AuthlaneConnect connectUrl={connectUrl} />',
            '',
            '```tsx',
            '<Warning>preserve this example</Warning>',
            '```',
            '',
          ].join('\r\n'),
        },
      ],
    });

    const document = model.documents[0];
    expect(document.source).not.toContain('\r');
    expect(document.publicMarkdown).toContain('> **Warning**');
    expect(document.publicMarkdown).toContain('> Keep credentials on the server.');
    expect(document.publicMarkdown).toContain('Visible instructions.');
    expect(document.publicMarkdown).not.toContain('<Tabs>');
    expect(document.publicMarkdown).not.toContain('<AuthlaneConnect');
    expect(document.publicMarkdown).toContain(
      '```tsx\n<Warning>preserve this example</Warning>\n```'
    );
  });

  it('emits page and heading search entries with stable shape and searchable identifiers', () => {
    const model = buildDocumentationModel({
      navigation: [{ group: 'SDK', pages: ['sdk/typescript'] }],
      documents: [
        {
          slug: 'sdk/typescript',
          source: [
            '---',
            'title: TypeScript SDK',
            'description: Use the server SDK.',
            '---',
            '',
            'Set `AUTHLANE_API_KEY` before continuing.',
            '',
            '## Configure a user',
            '',
            'Bind `externalUserId` and handle `INVALID_CHAT_REQUEST` for `google-calendar` at `<timestamp>`.',
            '',
            '## Run the agent',
            '',
            'This belongs only to the later section.',
            '',
          ].join('\n'),
        },
      ],
    });

    const entries = JSON.parse(renderGeneratedAssets(model).searchIndex);
    expect(entries).toHaveLength(3);
    expect(Object.keys(entries[0])).toEqual([
      'slug',
      'title',
      'description',
      'headingId',
      'heading',
      'text',
      'keywords',
    ]);
    expect(entries[0]).toMatchObject({
      slug: 'sdk/typescript',
      title: 'TypeScript SDK',
      description: 'Use the server SDK.',
      headingId: '',
      heading: '',
    });

    const configureEntry = entries.find(
      (entry: { headingId: string }) => entry.headingId === 'configure-a-user'
    );
    expect(configureEntry).toMatchObject({
      slug: 'sdk/typescript',
      heading: 'Configure a user',
    });
    expect(configureEntry.text).toContain('externalUserId');
    expect(configureEntry.text).not.toContain('later section');
    expect(configureEntry.keywords).toEqual(
      expect.arrayContaining([
        'externalUserId',
        'INVALID_CHAT_REQUEST',
        'google-calendar',
        '<timestamp>',
      ])
    );
    expect(entries[0].text).toContain('AUTHLANE_API_KEY');
  });

  it('preserves API metadata and canonicalizes documentation links in public assets', () => {
    const model = buildDocumentationModel({
      navigation: [
        { group: 'API', pages: ['api-reference/capabilities'] },
        { group: 'Start', pages: ['quickstart'] },
      ],
      documents: [
        {
          slug: 'api-reference/capabilities',
          source: [
            '---',
            'title: Get capabilities',
            'description: Read a snapshot.',
            "api: 'GET /api/v1/users/{externalUserId}/capabilities'",
            '---',
            '',
            '[Quickstart](/quickstart#install)',
            '[Already canonical](/docs/quickstart#install)',
            '[Absolute](https://authlane.io/docs/quickstart#install)',
            '[Non-doc route](/pricing)',
            '',
            '## Details',
            '',
            '[Same-page fragment](#details)',
            '',
          ].join('\n'),
        },
        {
          slug: 'quickstart',
          source:
            '---\ntitle: Quickstart\ndescription: Install Authlane.\n---\n\n## Install\n\nInstall it.\n',
        },
      ],
    });

    const assets = renderGeneratedAssets(model);
    const endpoint = JSON.parse(assets.manifest).documents[0];
    const markdown = assets.markdown.get('api-reference/capabilities');
    expect(endpoint.api).toBe('GET /api/v1/users/{externalUserId}/capabilities');
    expect(markdown).toContain('`GET /api/v1/users/{externalUserId}/capabilities`');
    expect(markdown).toContain('[Quickstart](/docs/quickstart#install)');
    expect(markdown).toContain('[Already canonical](/docs/quickstart#install)');
    expect(markdown).toContain('[Absolute](https://authlane.io/docs/quickstart#install)');
    expect(markdown).toContain('[Non-doc route](/pricing)');
    expect(markdown).toContain('[Same-page fragment](#details)');
    expect(assets.llmsFull).toContain('[Quickstart](/docs/quickstart#install)');
    expect(assets.llmsFull).not.toContain('[Quickstart](/quickstart#install)');
  });

  it('returns sorted violations for malformed navigation, metadata, markers, and links', () => {
    const violations = validateDocumentation({
      navigation: [{ group: 'Start', pages: ['start', 'missing'] }],
      documents: [
        {
          slug: 'start',
          source: [
            '---',
            'title: Start',
            '---',
            '',
            '## Working heading',
            '',
            'TODO: finish this.',
            '',
            '[Missing page](/docs/nope)',
            '[Missing fragment](#nope)',
            '',
            '```mystery',
            'value',
            '```',
          ].join('\n'),
        },
        {
          slug: 'orphan',
          source: '---\ntitle: Orphan\ndescription: Not linked.\n---\n',
        },
      ],
    });

    expect(violations).toEqual([...violations].sort((left, right) => left.localeCompare(right)));
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('start: missing frontmatter description:'),
        expect.stringContaining('start: unfinished authoring marker: TODO'),
        expect.stringContaining('start: broken internal page link: /docs/nope'),
        expect.stringContaining('start: broken internal fragment link: #nope'),
        expect.stringContaining('start: unknown code fence language "mystery":'),
        expect.stringContaining('missing: missing MDX: listed in navigation'),
        expect.stringContaining('orphan: orphan MDX: not listed in navigation'),
      ])
    );
  });

  it('reports malformed internal fragment encoding without throwing', () => {
    const violations = validateDocumentation({
      navigation: [{ group: 'Start', pages: ['start'] }],
      documents: [
        {
          slug: 'start',
          source: [
            '---',
            'title: Start',
            'description: Start here.',
            '---',
            '',
            '[Malformed](#bad%E0%A4%A)',
            '',
          ].join('\n'),
        },
      ],
    });

    expect(violations).toEqual(['start: malformed internal fragment encoding: #bad%E0%A4%A']);
  });

  it('loads every MDX document from a repository root in stable path order', () => {
    const root = mkdtempSync(join(tmpdir(), 'authlane-docs-'));
    temporaryDirectories.push(root);
    const docsRoot = join(root, 'apps', 'docs');
    mkdirSync(join(docsRoot, 'guides'), { recursive: true });
    writeFileSync(
      join(docsRoot, 'mint.json'),
      JSON.stringify({ navigation: [{ group: 'Start', pages: ['z-last', 'guides/a-first'] }] })
    );
    writeFileSync(join(docsRoot, 'z-last.mdx'), '---\ntitle: Z\ndescription: Z.\n---\n');
    writeFileSync(join(docsRoot, 'guides', 'a-first.mdx'), '---\ntitle: A\ndescription: A.\n---\n');

    const loaded = loadDocumentation(root);
    expect(loaded.navigation).toEqual([{ group: 'Start', pages: ['z-last', 'guides/a-first'] }]);
    expect(loaded.documents.map((document) => document.slug)).toEqual(['guides/a-first', 'z-last']);
  });

  it('validates the repository documentation source tree', () => {
    expect(validateDocumentation(loadDocumentation(repositoryRoot))).toEqual([]);
  });
});
