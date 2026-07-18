import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

const repositoryRoot = resolve(import.meta.dirname, '..');
const pluginRoot = join(repositoryRoot, 'plugins/authlane');
const expectedSkills = ['develop-authlane-connection', 'integrate-authlane'];
const manifests = {
  claude: join(pluginRoot, '.claude-plugin/plugin.json'),
  codex: join(pluginRoot, '.codex-plugin/plugin.json'),
  cursor: join(pluginRoot, '.cursor-plugin/plugin.json'),
};
const marketplaces = {
  claude: join(repositoryRoot, '.claude-plugin/marketplace.json'),
  codex: join(repositoryRoot, '.agents/plugins/marketplace.json'),
  cursor: join(repositoryRoot, '.cursor-plugin/marketplace.json'),
};

type Json = Record<string, unknown>;

function readJson(path: string): Json {
  expect(existsSync(path), `missing ${relative(repositoryRoot, path)}`).toBe(true);
  return JSON.parse(readFileSync(path, 'utf8')) as Json;
}

function object(value: unknown): Json {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  expect(Array.isArray(value)).toBe(false);
  return value as Json;
}

function array(value: unknown): unknown[] {
  expect(Array.isArray(value)).toBe(true);
  return value as unknown[];
}

function expectSafePath(base: string, declared: string, containmentRoot: string): string {
  expect(isAbsolute(declared)).toBe(false);
  expect(declared.split(/[\\/]+/)).not.toContain('..');
  const target = resolve(base, declared);
  const physical = realpathSync(target);
  const physicalRoot = realpathSync(containmentRoot);
  expect(physical === physicalRoot || physical.startsWith(`${physicalRoot}${sep}`)).toBe(true);
  return physical;
}

function walk(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? [child, ...walk(child)] : [child];
  });
}

function parseSkill(path: string): { frontmatter: Json; body: string } {
  const source = readFileSync(path, 'utf8');
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  expect(match, `invalid skill frontmatter in ${path}`).not.toBeNull();
  return { frontmatter: object(parseYaml(match?.[1] ?? '')), body: match?.[2] ?? '' };
}

describe('Authlane shared plugin contracts', () => {
  it('publishes exactly one plugin and the same two skills in every ecosystem', () => {
    const skillRoot = join(pluginRoot, 'skills');
    expect(existsSync(skillRoot), 'missing plugins/authlane/skills').toBe(true);
    const actualSkills = readdirSync(skillRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(actualSkills).toEqual(expectedSkills);

    const physicalSkillRoots = new Set<string>();
    for (const [ecosystem, marketplacePath] of Object.entries(marketplaces)) {
      const marketplace = readJson(marketplacePath);
      const plugins = array(marketplace.plugins);
      expect(plugins).toHaveLength(1);
      const entry = object(plugins[0]);
      expect(entry.name).toBe('authlane');
      const source =
        ecosystem === 'codex' ? String(object(entry.source).path) : String(entry.source);
      expect(expectSafePath(repositoryRoot, source, pluginRoot)).toBe(realpathSync(pluginRoot));

      const manifest = readJson(manifests[ecosystem as keyof typeof manifests]);
      expect(manifest.name).toBe('authlane');
      physicalSkillRoots.add(expectSafePath(pluginRoot, String(manifest.skills), pluginRoot));
    }
    expect([...physicalSkillRoots]).toEqual([realpathSync(skillRoot)]);
    for (const skill of expectedSkills) {
      expect(realpathSync(join([...physicalSkillRoots][0], skill))).toBe(
        realpathSync(join(skillRoot, skill))
      );
    }
  });

  it('matches current Claude, Codex, and pinned Cursor manifest formats', () => {
    const claude = readJson(manifests.claude);
    expect(Object.keys(claude).sort()).toEqual(
      [
        'author',
        'description',
        'displayName',
        'homepage',
        'keywords',
        'license',
        'name',
        'repository',
        'skills',
        'version',
      ].sort()
    );
    expect(claude.name).toBe('authlane');

    const codex = readJson(manifests.codex);
    expect(Object.keys(codex).sort()).toEqual(
      [
        'author',
        'description',
        'homepage',
        'interface',
        'keywords',
        'license',
        'name',
        'repository',
        'skills',
        'version',
      ].sort()
    );
    expect(object(codex.interface).capabilities).toEqual([
      'Authlane integration',
      'Authlane connection development',
    ]);

    const schemaRoot = join(repositoryRoot, 'scripts/fixtures/cursor-plugin-schemas');
    const upstream = readJson(join(schemaRoot, 'UPSTREAM.json'));
    expect(upstream).toMatchObject({
      repository: 'https://github.com/cursor/plugins',
      commit: '3fe2823ce17c1656c222d4b7c59d3f82fbf20143',
      retrievedAt: '2026-07-18',
    });
    const ajv = new Ajv({ allErrors: true, strict: true });
    addFormats(ajv);
    for (const [documentPath, schemaPath] of [
      [manifests.cursor, join(schemaRoot, 'plugin.schema.json')],
      [marketplaces.cursor, join(schemaRoot, 'marketplace.schema.json')],
    ]) {
      const validate = ajv.compile(readJson(schemaPath));
      expect(validate(readJson(documentPath)), JSON.stringify(validate.errors)).toBe(true);
    }
    expect(readJson(marketplaces.cursor)).toEqual({
      name: 'authlane',
      owner: { name: 'Authlane contributors' },
      metadata: { description: 'Official Authlane agent skills.' },
      plugins: [
        {
          name: 'authlane',
          source: 'plugins/authlane',
          description: 'Secure Authlane integration and connection development skills.',
        },
      ],
    });
  });

  it('keeps versions, MIT ownership, and local marketplace policy synchronized', () => {
    const pluginDocuments = Object.values(manifests).map(readJson);
    expect(new Set(pluginDocuments.map((manifest) => manifest.version))).toEqual(
      new Set(['0.1.0'])
    );
    for (const manifest of pluginDocuments) {
      expect(manifest).toMatchObject({
        name: 'authlane',
        version: '0.1.0',
        license: 'MIT',
        homepage: 'https://authlane.io/docs',
        repository: 'https://github.com/dxheroes/authlane',
        skills: './skills/',
      });
      expect(object(manifest.author).name).toBe('Authlane contributors');
    }
    const codexMarketplace = readJson(marketplaces.codex);
    expect(codexMarketplace).toEqual({
      name: 'authlane',
      interface: { displayName: 'Authlane' },
      plugins: [
        {
          name: 'authlane',
          source: { source: 'local', path: './plugins/authlane' },
          policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
          category: 'Developer Tools',
        },
      ],
    });
  });

  it('keeps every declared path inside the shared plugin and bundles instructions only', () => {
    const forbiddenFiles = new Set(['.mcp.json', '.app.json']);
    for (const path of walk(pluginRoot)) {
      expect(realpathSync(path).startsWith(`${realpathSync(pluginRoot)}${sep}`)).toBe(true);
      if (!lstatSync(path).isDirectory())
        expect(forbiddenFiles.has(path.split(sep).at(-1) ?? '')).toBe(false);
    }
    for (const manifestPath of Object.values(manifests)) {
      const manifest = readJson(manifestPath);
      expect(manifest).not.toHaveProperty('mcpServers');
      expect(manifest).not.toHaveProperty('apps');
      expect(manifest).not.toHaveProperty('hooks');
    }
  });

  it('validates concise skills, generated UI metadata, resources, and placeholders', () => {
    const requiredReferences: Record<string, string[]> = {
      'integrate-authlane': [
        'python.md',
        'security-boundaries.md',
        'typescript.md',
        'verification.md',
      ],
      'develop-authlane-connection': [
        'connection-contract.md',
        'provider-security.md',
        'testing.md',
      ],
    };
    for (const skill of expectedSkills) {
      const root = join(pluginRoot, 'skills', skill);
      const parsed = parseSkill(join(root, 'SKILL.md'));
      expect(Object.keys(parsed.frontmatter).sort()).toEqual(['description', 'name']);
      expect(parsed.frontmatter.name).toBe(skill);
      expect(String(parsed.frontmatter.description)).toMatch(/^Use when /);
      expect(parsed.body.trim().split(/\s+/).length).toBeLessThan(500);

      const agentSource = readFileSync(join(root, 'agents/openai.yaml'), 'utf8');
      const agent = object(parseYaml(agentSource));
      expect(Object.keys(agent)).toEqual(['interface']);
      expect(Object.keys(object(agent.interface)).sort()).toEqual([
        'default_prompt',
        'display_name',
        'short_description',
      ]);
      expect(String(object(agent.interface).default_prompt)).toContain(`$${skill}`);
      expect(agentSource).toMatch(/display_name: ".+"/);
      expect(agentSource).toMatch(/short_description: ".+"/);
      expect(agentSource).toMatch(/default_prompt: ".+"/);

      const referenceRoot = join(root, 'references');
      expect(
        readdirSync(referenceRoot, { withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => entry.name)
          .sort()
      ).toEqual(requiredReferences[skill]);
      expect(existsSync(join(root, 'README.md'))).toBe(false);
    }
    const pluginText = walk(pluginRoot)
      .filter((path) => !lstatSync(path).isDirectory())
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    expect(pluginText).not.toMatch(/\[TODO:|placeholder/i);
  });
});

describe('manual release safety contracts', () => {
  for (const [workflow, environment] of [
    ['publish-npm.yml', 'npm-publish'],
    ['publish-pypi.yml', 'pypi-publish'],
  ]) {
    it(`${workflow} is manual, protected, OIDC-only, and validates before publishing`, () => {
      const path = join(repositoryRoot, '.github/workflows', workflow);
      expect(existsSync(path), `missing ${path}`).toBe(true);
      const source = readFileSync(path, 'utf8');
      const document = object(parseYaml(source));
      expect(document.permissions).toEqual({});
      const triggers = object(document.on);
      expect(Object.keys(triggers)).toEqual(['workflow_dispatch']);
      const input = object(object(object(triggers.workflow_dispatch).inputs).publish);
      expect(input).toMatchObject({ required: true, type: 'boolean', default: false });
      expect(source).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN|PYPI_TOKEN|password:|username:/);
      expect(source.match(/persist-credentials: false/g)).toHaveLength(2);

      const jobs = object(document.jobs);
      const validate = object(jobs.validate);
      const publish = object(jobs.publish);
      expect(validate.permissions).toEqual({ contents: 'read' });
      expect(JSON.stringify(validate)).not.toMatch(/changeset publish|pypi-publish/i);
      expect(publish).toMatchObject({
        if: `\${{ inputs.publish }}`,
        needs: 'validate',
        environment,
        permissions: { contents: 'read', 'id-token': 'write' },
      });
      expect(publish['runs-on']).toMatch(/^ubuntu-/);
      expect(publish.concurrency).toBeTruthy();
      if (workflow === 'publish-npm.yml') {
        expect(source).toContain('NPM_CONFIG_PROVENANCE: "true"');
        expect(source).not.toContain('npm install --global');
      } else {
        expect(source).toMatch(/attestations:\s+true/);
        expect(source.match(/enable-cache: false/g)).toHaveLength(2);
        expect(source.match(/version: 0\.11\.14/g)).toHaveLength(2);
        expect(source).not.toMatch(/\buvx\s+twine\b/);
        expect(source).not.toMatch(/uv run --isolated --no-project --with/);
        expect(
          source.match(
            /uv sync --project packages\/python --frozen --no-dev --group release --no-install-project/g
          )
        ).toHaveLength(2);
        expect(source.match(/python3 scripts\/smoke-python-artifact\.py/g)).toHaveLength(4);
      }
    });
  }

  it('resolves Python release and artifact-smoke dependencies from committed hashes', () => {
    const rootManifest = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'));
    const scripts = object(rootManifest.scripts);
    expect(scripts['release:python:lock:check']).toBe(
      'python3 scripts/validate-python-release-lock.py'
    );
    expect(String(scripts['release:python:build'])).toContain(
      'uv sync --project packages/python --frozen --no-dev --group release --no-install-project'
    );
    expect(String(scripts['release:python:build'])).toContain(
      'uv run --project packages/python --no-sync uv build'
    );
    expect(String(scripts['release:python:check'])).toContain(
      'uv run --project packages/python --no-sync twine check'
    );
    expect(String(scripts['release:python:check'])).not.toContain('uvx twine');
    expect(
      String(scripts['release:python:check']).match(/smoke-python-artifact\.py/g)
    ).toHaveLength(2);

    const pyproject = readFileSync(join(repositoryRoot, 'packages/python/pyproject.toml'), 'utf8');
    expect(pyproject).toContain('release = [');
    expect(pyproject).toContain('"hatchling==1.27.0"');
    expect(pyproject).toContain('"twine==6.2.0"');

    const requirements = readFileSync(
      join(repositoryRoot, 'packages/python/release-requirements.txt'),
      'utf8'
    );
    for (const dependency of [
      'hatchling==1.27.0',
      'httpx==0.28.1',
      'jsonschema==4.26.0',
      'twine==6.2.0',
    ]) {
      expect(requirements).toContain(dependency);
    }
    expect(requirements).toContain('--hash=sha256:');

    const lockValidator = readFileSync(
      join(repositoryRoot, 'scripts/validate-python-release-lock.py'),
      'utf8'
    );
    expect(lockValidator).toMatch(/"lock",\s+"--project",\s+"packages\/python",\s+"--check"/);

    const smoke = readFileSync(join(repositoryRoot, 'scripts/smoke-python-artifact.py'), 'utf8');
    expect(smoke).toContain('--require-hashes');
    expect(smoke).toContain('--no-deps');
    expect(smoke).toContain('--no-build-isolation');
    expect(smoke).toMatch(/"--python",\s+"3\.11"/);
    expect(smoke).toContain('"-I"');
  });
});

describe('public plugin and release documentation', () => {
  it('documents exact install, update, local-test, release, and non-action boundaries', () => {
    const install = readFileSync(join(repositoryRoot, 'docs/agent-plugins.md'), 'utf8');
    for (const expected of [
      'claude plugin marketplace add dxheroes/authlane',
      'claude plugin install authlane@authlane',
      '/plugin marketplace add dxheroes/authlane',
      '/plugin install authlane@authlane',
      'claude --plugin-dir ./plugins/authlane',
      'claude plugin marketplace update authlane',
      'claude plugin update authlane@authlane',
      'codex plugin marketplace add dxheroes/authlane',
      'codex plugin marketplace add /absolute/path/to/authlane',
      'codex plugin add authlane@authlane',
      'codex plugin marketplace upgrade authlane',
      '/add-plugin authlane@https://github.com/dxheroes/authlane',
      '~/.cursor/plugins/local/authlane',
      'integrate-authlane',
      'develop-authlane-connection',
    ]) {
      expect(install).toContain(expected);
    }
    expect(install).toMatch(/no MCP server/i);
    expect(install).toMatch(/no .*credentials?/i);
    expect(install).not.toMatch(/listed in|available in the (Claude|Codex|Cursor) marketplace/i);

    const release = readFileSync(join(repositoryRoot, 'docs/releasing.md'), 'utf8');
    for (const expected of [
      'publish=false',
      'publish=true',
      'npm-publish',
      'pypi-publish',
      'OIDC',
      'provenance',
      'npm deprecate',
      'PyPI yank',
      'does not publish',
      'Allowed actions: `npm publish`',
      '--allow-publish',
    ]) {
      expect(release).toContain(expected);
    }
  });
});
