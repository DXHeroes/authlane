import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '..');
const readme = readFileSync(resolve(repositoryRoot, 'README.md'), 'utf8');

describe('README developer experience', () => {
  it('leads with the outcome and direct provider boundary', () => {
    expect(readme.indexOf('Give every signed-in user tools')).toBeLessThan(readme.indexOf('##'));
    expect(readme).toMatch(/Your\s+trusted runtime executes tools and calls providers directly\./);
    expect(readme).toContain('Authlane is not in this path');
    expect(readme).not.toContain('https://authlane.example.com');
  });

  it('contains initialized TypeScript and Python paths with empty allowlist semantics', () => {
    expect(readme).toContain("import { Authlane } from '@authlane/sdk';");
    expect(readme).toContain("baseUrl: 'https://app.authlane.io'");
    expect(readme).toContain('allowedServices: []');
    expect(readme).toContain('snapshots every service currently enabled for the tenant');
    expect(readme).toContain('from authlane import Authlane');
    expect(readme).toContain('from authlane.adapters import langchain');
  });

  it('links every canonical developer destination using published manifest routes', () => {
    for (const link of [
      '[Documentation](https://authlane.io/docs)',
      '[Quickstart](https://authlane.io/docs/quickstart)',
      '[API reference](https://authlane.io/docs/api-reference)',
      '[OpenAPI YAML](https://authlane.io/docs/openapi.yaml)',
      '[OpenAPI JSON](https://authlane.io/docs/openapi.json)',
      '[TypeScript SDK](https://authlane.io/docs/sdk/typescript)',
      '[Python SDK](https://authlane.io/docs/sdk/python)',
      '[Framework adapters](https://authlane.io/docs/sdk/frameworks)',
      '[Integration authoring](https://authlane.io/docs/guides/custom-integrations)',
      '[AI coding tools](https://authlane.io/docs/ai-tools/marketplace)',
    ]) {
      expect(readme).toContain(link);
    }
    expect(existsSync(resolve(repositoryRoot, 'apps/docs/api-reference/openapi.yaml'))).toBe(true);
  });

  it('explains tenant tool filtering and framework approval separately', () => {
    expect(readme).toContain('`read_only` or `full`');
    expect(readme).toContain("risk: 'read' | 'write' | 'destructive'");
    expect(readme).toContain("vercelAI({ approval: 'write-and-destructive' })");
  });

  it('links the completed shared agent plugin', () => {
    expect(readme).toContain('[Agent plugin](./docs/agent-plugins.md)');
    expect(readme).toContain('`integrate-authlane`');
    expect(readme).toContain('`develop-authlane-connection`');
    for (const path of [
      '.claude-plugin/marketplace.json',
      '.agents/plugins/marketplace.json',
      '.cursor-plugin/marketplace.json',
      'plugins/authlane',
    ]) {
      expect(existsSync(resolve(repositoryRoot, path))).toBe(true);
    }
  });
});
