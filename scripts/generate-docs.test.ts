import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import docsManifest from '../apps/landing/app/generated/docs-manifest.json';
import sitemap from '../apps/landing/app/sitemap';
import {
  buildDocumentationModel,
  loadDocumentation,
  loadIntegrationConfigs,
  renderGeneratedAssets,
  renderIntegrationPackageReadmes,
  validateDocumentation,
  validateIntegrationPages,
  validateRepositoryDocumentation,
} from './docs-content.mjs';

describe('documentation asset generation', () => {
  const temporaryDirectories: string[] = [];
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps the complete offline docs gate separate from the bounded network smoke', () => {
    const scripts = JSON.parse(
      readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')
    ).scripts;
    const landingScripts = JSON.parse(
      readFileSync(resolve(repositoryRoot, 'apps/landing/package.json'), 'utf8')
    ).scripts;

    expect(scripts['docs:check']).toContain('generate-docs.mjs --check');
    expect(scripts['docs:check']).toContain('docs-domain-contract.test.ts');
    expect(scripts['docs:check']).toContain('readme-devex.test.ts');
    expect(scripts['docs:check']).toContain('generate-docs.test.ts');
    expect(scripts['docs:check']).not.toContain('check-doc-links');
    expect(scripts['docs:links']).toBe('node scripts/check-doc-links.mjs');
    expect(scripts.build).not.toContain('docs:links');
    expect(landingScripts.prebuild).toContain('openapi:check');
    expect(landingScripts.prebuild).toContain('docs:check');
    expect(landingScripts.prebuild).not.toContain('docs:links');
  });

  it('publishes every manifest route exactly once with introduction canonicalized to docs home', () => {
    const urls = sitemap().map((entry) => entry.url);
    const expectedUrls = new Set([
      'https://authlane.io/',
      ...docsManifest.documents.map(({ slug }) =>
        slug === 'introduction' ? 'https://authlane.io/docs' : `https://authlane.io/docs/${slug}`
      ),
    ]);

    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).not.toContain('https://authlane.io/docs/introduction');
    expect(new Set(urls)).toEqual(expectedUrls);
    expect(urls.filter((url) => url === 'https://authlane.io/docs/api-reference')).toHaveLength(1);
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
    expect(first.manifest).toContain('"pages": ["introduction"]');
    expect(JSON.parse(first.searchIndex)[0].text).toContain('Provider traffic stays direct');
    expect(JSON.parse(first.searchIndex)[0].href).toBe('/docs');
    expect(first.markdown.get('introduction')).toContain('## Boundary');
    expect(first.llms).toContain('https://authlane.io/docs');
    expect(first.llmsFull).toContain('Provider traffic stays direct');
  });

  it('generates one canonical package README per integration without obsolete runtime routes', () => {
    const configs = loadIntegrationConfigs(repositoryRoot);
    const readmes = renderIntegrationPackageReadmes(configs);

    expect(readmes.size).toBe(configs.length);
    for (const config of configs) {
      const readme = readmes.get(config.serviceId) ?? '';
      expect(readme).toContain(`pnpm add @authlane/integration-${config.serviceId}`);
      expect(readme).toContain(`https://authlane.io/docs/integrations/${config.serviceId}`);
      expect(readme).not.toContain('/api/v1/users/');
      expect(readme).not.toContain('/tools/');
    }
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

  it('converts safe CodeGroup items into labelled Markdown fences', () => {
    const model = buildDocumentationModel({
      navigation: [{ group: 'Start', pages: ['quickstart'] }],
      documents: [
        {
          slug: 'quickstart',
          source: [
            '---',
            'title: Quickstart',
            'description: Choose a runtime.',
            '---',
            '',
            '<CodeGroup>',
            '<CodeGroupItem label="TypeScript">',
            '',
            '```typescript',
            'const ok = true;',
            '```',
            '',
            '</CodeGroupItem>',
            '<CodeGroupItem label="Python">',
            '',
            '```python',
            'ok = True',
            '```',
            '',
            '</CodeGroupItem>',
            '</CodeGroup>',
          ].join('\n'),
        },
      ],
    });

    const markdown = model.documents[0].publicMarkdown;
    expect(markdown).toContain('### TypeScript\n\n```typescript\nconst ok = true;\n```');
    expect(markdown).toContain('### Python\n\n```python\nok = True\n```');
    expect(markdown).not.toContain('<CodeGroup');
    expect(markdown).not.toContain('<CodeGroupItem');
  });

  it('fails closed for every CodeGroupItem shape the renderer cannot safely convert', () => {
    const violationsFor = (lines: string[]) =>
      validateDocumentation({
        navigation: [{ group: 'Start', pages: ['quickstart'] }],
        documents: [
          {
            slug: 'quickstart',
            source: [
              '---',
              'title: Quickstart',
              'description: Choose a runtime.',
              '---',
              '',
              '<CodeGroup>',
              ...lines,
              '</CodeGroup>',
            ].join('\n'),
          },
        ],
      }).filter((violation) => violation.includes('CodeGroupItem'));

    expect(
      violationsFor([
        '<CodeGroupItem label="TypeScript">',
        '',
        '```typescript',
        'const ok = true;',
        '```',
        '',
        '</CodeGroupItem>',
      ])
    ).toEqual([]);

    for (const invalid of [
      [
        '<CodeGroupItem label="TypeScript">',
        '<strong>This is markup, not code.</strong>',
        '</CodeGroupItem>',
      ],
      ['<CodeGroupItem label="TypeScript">', '```typescript', 'const ok = true;', '```'],
      [
        '<CodeGroupItem label="TypeScript">',
        '```typescript',
        'const one = true;',
        '```',
        '```typescript',
        'const two = true;',
        '```',
        '</CodeGroupItem>',
      ],
      [
        '<CodeGroupItem label="TypeScript">',
        'extra content',
        '```typescript',
        'const ok = true;',
        '```',
        '</CodeGroupItem>',
      ],
      [
        '<CodeGroupItem label="TypeScript" id="typescript">',
        '```typescript',
        'const ok = true;',
        '```',
        '</CodeGroupItem>',
      ],
      [
        '<CodeGroupItem',
        '  label="TypeScript">',
        '```typescript',
        'const ok = true;',
        '```',
        '</CodeGroupItem>',
      ],
      [
        '<CodeGroupItem label="Outer">',
        '<CodeGroupItem label="Nested">',
        '```typescript',
        'const ok = true;',
        '```',
        '</CodeGroupItem>',
        '</CodeGroupItem>',
      ],
      ['</CodeGroupItem>'],
      [
        '<CodeGroupItem label={runtime}>',
        '```typescript',
        'const ok = true;',
        '```',
        '</CodeGroupItem>',
      ],
    ]) {
      expect(violationsFor(invalid)).not.toEqual([]);
    }
  });

  it('publishes every Quickstart runtime as labelled plain Markdown without expression props', () => {
    const assets = renderGeneratedAssets(
      buildDocumentationModel(loadDocumentation(repositoryRoot))
    );
    const quickstart = assets.markdown.get('quickstart') ?? '';

    for (const label of [
      'Vercel AI',
      'OpenAI Agents',
      'Mastra',
      'Agno',
      'LangChain',
      'Local MCP',
    ]) {
      expect(quickstart.match(new RegExp(`^### ${label}$`, 'gm'))).toHaveLength(2);
      expect(assets.llmsFull.match(new RegExp(`^### ${label}$`, 'gm'))).toHaveLength(2);
    }
    for (const output of [quickstart, assets.llmsFull]) {
      expect(output).not.toContain('<CodeGroup');
      expect(output).not.toContain('<CodeGroupItem');
      expect(output).not.toContain('labels={');
      expect(output).not.toContain('sources={');
      expect(output).not.toContain('`pnpm add @authlane/sdk @authlane/ai ai zod`,');
    }
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
      'href',
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

  function createIntegrationFixture(manifestContents?: string | null) {
    const root = mkdtempSync(join(tmpdir(), 'authlane-integration-docs-'));
    temporaryDirectories.push(root);
    const integrationRoot = join(root, 'integrations', 'github');
    const manifestRoot = join(root, 'packages', 'integration-contracts', 'manifests', 'v1');
    mkdirSync(integrationRoot, { recursive: true });
    mkdirSync(manifestRoot, { recursive: true });
    writeFileSync(
      join(integrationRoot, 'config.yaml'),
      [
        'id: github',
        'name: GitHub',
        'auth_type: oauth2',
        'config:',
        '  scopes:',
        '    - repo',
        '    - user',
        '  default_scopes:',
        '    - repo',
        '',
      ].join('\n')
    );
    writeFileSync(
      join(integrationRoot, 'tools.ts'),
      "export const tools = { wrong: { definition: { name: 'github_not_canonical' } } };\n"
    );
    if (manifestContents !== null) {
      writeFileSync(
        join(manifestRoot, 'github.json'),
        manifestContents ??
          `${JSON.stringify(
            {
              schemaVersion: '1.0',
              serviceId: 'github',
              tools: [{ name: 'github_create_issue' }],
            },
            null,
            2
          )}\n`
      );
    }
    return { root, manifestRoot };
  }

  it('loads tool names from canonical manifests instead of TypeScript source text', () => {
    const { root } = createIntegrationFixture();

    expect(loadIntegrationConfigs(root)[0]).toMatchObject({
      availableScopes: ['repo', 'user'],
      defaultScopes: ['repo'],
      toolNames: ['github_create_issue'],
    });
  });

  it('rejects a missing canonical integration manifest', () => {
    const { root } = createIntegrationFixture(null);

    expect(() => loadIntegrationConfigs(root)).toThrow(
      'integrations/github: missing canonical manifest "packages/integration-contracts/manifests/v1/github.json"'
    );
  });

  it('rejects invalid canonical manifest JSON', () => {
    const { root } = createIntegrationFixture('{');

    expect(() => loadIntegrationConfigs(root)).toThrow(
      'packages/integration-contracts/manifests/v1/github.json: invalid canonical manifest JSON'
    );
  });

  it('rejects malformed canonical manifest object shapes', () => {
    const { root } = createIntegrationFixture('[]\n');

    expect(() => loadIntegrationConfigs(root)).toThrow(
      'packages/integration-contracts/manifests/v1/github.json: manifest must be an object'
    );
  });

  it('rejects a manifest service ID that does not match its config', () => {
    const { root } = createIntegrationFixture(
      `${JSON.stringify({ serviceId: 'git-hub', tools: [{ name: 'github_create_issue' }] })}\n`
    );

    expect(() => loadIntegrationConfigs(root)).toThrow(
      'packages/integration-contracts/manifests/v1/github.json: serviceId "git-hub" does not match config "github"'
    );
  });

  it('rejects duplicate tool names in a canonical manifest', () => {
    const { root } = createIntegrationFixture(
      `${JSON.stringify({
        serviceId: 'github',
        tools: [{ name: 'github_create_issue' }, { name: 'github_create_issue' }],
      })}\n`
    );

    expect(() => loadIntegrationConfigs(root)).toThrow(
      'packages/integration-contracts/manifests/v1/github.json: duplicate tool name "github_create_issue"'
    );
  });

  it('rejects empty and invalid canonical manifest tool names', () => {
    const empty = createIntegrationFixture(
      `${JSON.stringify({ serviceId: 'github', tools: [] })}\n`
    );
    expect(() => loadIntegrationConfigs(empty.root)).toThrow(
      'packages/integration-contracts/manifests/v1/github.json: tools must contain at least one definition'
    );

    const invalid = createIntegrationFixture(
      `${JSON.stringify({ serviceId: 'github', tools: [{ name: 'GitHub Tool' }] })}\n`
    );
    expect(() => loadIntegrationConfigs(invalid.root)).toThrow(
      'packages/integration-contracts/manifests/v1/github.json: invalid tool name "GitHub Tool"'
    );
  });

  it('rejects duplicate and unmatched canonical manifests', () => {
    const duplicate = createIntegrationFixture();
    writeFileSync(
      join(duplicate.manifestRoot, 'zz-github.json'),
      `${JSON.stringify({ serviceId: 'github', tools: [{ name: 'github_list_issues' }] })}\n`
    );
    expect(() => loadIntegrationConfigs(duplicate.root)).toThrow(
      'packages/integration-contracts/manifests/v1/zz-github.json: duplicate canonical manifest serviceId "github"'
    );

    const unmatched = createIntegrationFixture();
    writeFileSync(
      join(unmatched.manifestRoot, 'slack.json'),
      `${JSON.stringify({ serviceId: 'slack', tools: [{ name: 'slack_send_message' }] })}\n`
    );
    expect(() => loadIntegrationConfigs(unmatched.root)).toThrow(
      'packages/integration-contracts/manifests/v1/slack.json: manifest has no matching integration config'
    );
  });

  it('loads the exact shipped 18-service and 209-tool manifest inventory', () => {
    const integrations = loadIntegrationConfigs(repositoryRoot);

    expect(integrations).toHaveLength(18);
    expect(integrations.flatMap(({ toolNames }) => toolNames)).toHaveLength(209);
  });

  it('validates the repository documentation source tree', () => {
    expect(validateDocumentation(loadDocumentation(repositoryRoot))).toEqual([]);
  });

  it('requires a one-to-one mapping between integration configs and pages', () => {
    const model = buildDocumentationModel({
      navigation: [{ group: 'Integrations', pages: ['integrations/ghost'] }],
      documents: [
        {
          slug: 'integrations/ghost',
          source:
            '---\ntitle: Ghost\ndescription: Ghost.\nserviceId: ghost\nauthType: oauth2\n---\n',
        },
      ],
    });

    expect(
      validateIntegrationPages(model, [
        {
          name: 'GitHub',
          serviceId: 'github',
          authType: 'oauth2',
          availableScopes: [],
          defaultScopes: [],
          toolNames: [],
        },
      ])
    ).toEqual(
      expect.arrayContaining([
        'integrations/ghost: integration page has no matching config',
        'integrations/github: integration page missing for configured integration',
      ])
    );
  });

  it('requires config metadata and all integration setup sections', () => {
    const model = buildDocumentationModel({
      navigation: [{ group: 'Integrations', pages: ['integrations/github'] }],
      documents: [
        {
          slug: 'integrations/github',
          source: [
            '---',
            'title: Github',
            'description: GitHub.',
            'serviceId: git-hub',
            'authType: api-key',
            '---',
            '',
            '## Prerequisites',
            '',
          ].join('\n'),
        },
      ],
    });

    const violations = validateIntegrationPages(model, [
      {
        name: 'GitHub',
        serviceId: 'github',
        authType: 'oauth2',
        availableScopes: [],
        defaultScopes: [],
        toolNames: [],
      },
    ]);
    expect(violations).toEqual(
      expect.arrayContaining([
        'integrations/github: integration page title "Github" does not match config "GitHub"',
        'integrations/github: integration page description does not match required value',
        'integrations/github: integration page serviceId "git-hub" does not match config "github"',
        'integrations/github: integration page authType "api-key" does not match config "oauth2"',
        'integrations/github: integration page missing section "Available tools"',
        'integrations/github: integration page missing section "Connection lifecycle"',
      ])
    );
  });

  it('requires every default scope and exact exported tool inventory', () => {
    const model = buildDocumentationModel({
      navigation: [{ group: 'Integrations', pages: ['integrations/github'] }],
      documents: [
        {
          slug: 'integrations/github',
          source: [
            '---',
            'title: GitHub',
            'description: GitHub.',
            'serviceId: github',
            'authType: oauth2',
            '---',
            '',
            '## Prerequisites',
            '## Configure authentication',
            '## Scopes',
            '`user`',
            '## Available tools',
            '`github_create_issue`',
            '`github_unknown_tool`',
            '## Connection lifecycle',
            '## Troubleshooting',
            '',
          ].join('\n'),
        },
      ],
    });

    expect(
      validateIntegrationPages(model, [
        {
          name: 'GitHub',
          serviceId: 'github',
          authType: 'oauth2',
          availableScopes: ['repo', 'user'],
          defaultScopes: ['repo', 'user'],
          toolNames: ['github_create_issue', 'github_list_issues'],
        },
      ])
    ).toEqual(
      expect.arrayContaining([
        'integrations/github: integration page missing default scope "repo" in section "Scopes"',
        'integrations/github: integration page missing exported tool "github_list_issues" in section "Available tools"',
        'integrations/github: integration page documents unknown tool "github_unknown_tool" in section "Available tools"',
      ])
    );
  });

  it('requires an explicit explanation when config declares no default scopes', () => {
    const model = buildDocumentationModel({
      navigation: [{ group: 'Integrations', pages: ['integrations/notion'] }],
      documents: [
        {
          slug: 'integrations/notion',
          source: [
            '---',
            'title: Notion',
            'description: Notion.',
            'serviceId: notion',
            'authType: oauth2',
            '---',
            '',
            '## Prerequisites',
            '## Configure authentication',
            '## Scopes',
            'Configure access.',
            '## Available tools',
            '## Connection lifecycle',
            '## Troubleshooting',
            '',
          ].join('\n'),
        },
      ],
    });

    expect(
      validateIntegrationPages(model, [
        {
          name: 'Notion',
          serviceId: 'notion',
          authType: 'oauth2',
          availableScopes: [],
          defaultScopes: [],
          toolNames: [],
        },
      ])
    ).toContain('integrations/notion: integration page missing empty default-scope explanation');
  });

  function githubIntegrationModel(sectionLines: string[]) {
    return buildDocumentationModel({
      navigation: [{ group: 'Integrations', pages: ['integrations/github'] }],
      documents: [
        {
          slug: 'integrations/github',
          source: [
            '---',
            'title: GitHub',
            "description: 'Connect GitHub and use its tools through the Authlane control plane.'",
            'serviceId: github',
            'authType: oauth2',
            '---',
            '',
            ...sectionLines,
            '',
          ].join('\n'),
        },
      ],
    });
  }

  const githubIntegrationConfig = {
    name: 'GitHub',
    serviceId: 'github',
    authType: 'oauth2',
    availableScopes: ['repo', 'user'],
    defaultScopes: ['repo'],
    toolNames: ['github_create_issue'],
    docsUrl: 'https://docs.github.com/en/rest',
    setupGuideUrl:
      'https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app',
    developerConsoleUrl: 'https://github.com/settings/developers',
    execution: {
      preferred: 'provider_mcp',
      providerMcp: {
        endpoint: 'https://api.githubcopilot.com/mcp/',
        docsUrl:
          'https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/set-up-the-github-mcp-server',
      },
    },
  };

  const completeGithubSections = [
    '## Prerequisites',
    '[REST docs](https://docs.github.com/en/rest)',
    '[OAuth setup](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)',
    '[Developer console](https://github.com/settings/developers)',
    '## Self-hosted setup',
    '`https://<your-authlane-host>/api/v1/oauth/github/callback`',
    '## Configure authentication',
    'Copy the Client ID and Client Secret in Dashboard → Services.',
    '## Scopes',
    '- `repo` permits repositories.',
    '## Execution path',
    'Prefer the official provider MCP at `https://api.githubcopilot.com/mcp/`.',
    '## Available tools',
    '- `github_create_issue`',
    '## Connection lifecycle',
    'Reconnect when required.',
    '## Troubleshooting',
    'Check repository access.',
  ];

  it('requires exactly fourteen config-manifest contracts and pages', () => {
    const violations = validateIntegrationPages(
      buildDocumentationModel({ navigation: [], documents: [] }),
      []
    );

    expect(violations).toEqual([
      'integrations: integration page config/manifest count must be 18, found 0',
      'integrations: integration page count must be 18, found 0',
    ]);
  });

  it('requires every section heading at H2 depth', () => {
    const sections = completeGithubSections.map((line) =>
      line === '## Scopes' ? '### Scopes' : line
    );

    expect(
      validateIntegrationPages(githubIntegrationModel(sections), [githubIntegrationConfig])
    ).toContain('integrations/github: integration page missing section "Scopes"');
  });

  it('rejects extra H2 sections', () => {
    const sections = [...completeGithubSections, '## Unsupported', 'Do not add this.'];

    expect(
      validateIntegrationPages(githubIntegrationModel(sections), [githubIntegrationConfig])
    ).toContain('integrations/github: integration page unexpected section "Unsupported"');
  });

  it('requires all H2 sections in the approved order', () => {
    const sections = [...completeGithubSections];
    const scopesIndex = sections.indexOf('## Scopes');
    const toolsIndex = sections.indexOf('## Available tools');
    [sections[scopesIndex], sections[toolsIndex]] = [sections[toolsIndex], sections[scopesIndex]];

    expect(
      validateIntegrationPages(githubIntegrationModel(sections), [githubIntegrationConfig])
    ).toContain('integrations/github: integration page sections are out of order');
  });

  it('rejects a bullet-listed scope absent from provider config', () => {
    const sections = completeGithubSections.flatMap((line) =>
      line === '- `repo` permits repositories.' ? [line, '- `admin` is invented.'] : [line]
    );

    expect(
      validateIntegrationPages(githubIntegrationModel(sections), [githubIntegrationConfig])
    ).toContain('integrations/github: integration page documents scope "admin" absent from config');
  });

  it('does not accept a default scope outside the Scopes section', () => {
    const sections = completeGithubSections.map((line) =>
      line === '- `repo` permits repositories.' ? '- `user` reads users.' : line
    );
    sections.splice(1, 0, 'The `repo` scope is mentioned here.');

    expect(
      validateIntegrationPages(githubIntegrationModel(sections), [githubIntegrationConfig])
    ).toContain(
      'integrations/github: integration page missing default scope "repo" in section "Scopes"'
    );
  });

  it('does not accept an exported tool outside Available tools', () => {
    const sections = completeGithubSections.filter((line) => line !== '- `github_create_issue`');
    sections.push('The `github_create_issue` tool is mentioned after troubleshooting.');

    expect(
      validateIntegrationPages(githubIntegrationModel(sections), [githubIntegrationConfig])
    ).toContain(
      'integrations/github: integration page missing exported tool "github_create_issue" in section "Available tools"'
    );
  });

  it('rejects duplicate and unknown tools in Available tools', () => {
    const sections = completeGithubSections.flatMap((line) =>
      line === '- `github_create_issue`' ? [line, line, '- `github_unknown_tool`'] : [line]
    );
    const violations = validateIntegrationPages(githubIntegrationModel(sections), [
      githubIntegrationConfig,
    ]);

    expect(violations).toEqual(
      expect.arrayContaining([
        'integrations/github: integration page duplicate exported tool "github_create_issue" in section "Available tools"',
        'integrations/github: integration page documents unknown tool "github_unknown_tool" in section "Available tools"',
      ])
    );
  });

  it('documents Gmail capability boundaries from configured scopes', () => {
    const gmail = loadDocumentation(repositoryRoot).documents.find(
      ({ slug }) => slug === 'integrations/gmail'
    )?.source;

    expect(gmail).not.toContain('`gmail_delete_email`');
    expect(gmail).toContain('Permanent deletion is deliberately not exposed');
    expect(gmail).toMatch(/requires the restricted\s+`https:\/\/mail\.google\.com\/` scope/);
    expect(gmail).toContain('`gmail_trash_email`');
    expect(gmail).toContain('`gmail_create_label`');
  });

  it('documents Slack file upload boundary and status scope', () => {
    const slack = loadDocumentation(repositoryRoot).documents.find(
      ({ slug }) => slug === 'integrations/slack'
    )?.source;

    expect(slack).not.toContain('`slack_post_file`');
    expect(slack).toContain('retired `files.upload`');
    expect(slack).toContain("Slack's current external upload flow");
    expect(slack).toContain('`slack_set_status`');
    expect(slack).toContain('`users.profile:write` updates the connected user');
  });

  it('requires every shipped integration page to match config and required sections', async () => {
    const violations = await validateRepositoryDocumentation(repositoryRoot);
    expect(violations.filter((value) => value.includes('integration page'))).toEqual([]);
  });
});
