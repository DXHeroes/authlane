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

  it('links the canonical docs and OpenAPI contract', () => {
    expect(readme).toContain('[Documentation](https://authlane.io/docs)');
    expect(readme).toContain('[API reference](https://authlane.io/docs/api-reference)');
    expect(readme).toContain('[OpenAPI YAML](https://authlane.io/docs/openapi.yaml)');
    expect(existsSync(resolve(repositoryRoot, 'apps/docs/api-reference/openapi.yaml'))).toBe(true);
  });

  it('reserves non-clickable Task 05 marketplace and skill entry points', () => {
    for (const value of [
      'integrate-authlane',
      'develop-authlane-connection',
      '.claude-plugin/marketplace.json',
      '.agents/plugins/marketplace.json',
      '.cursor-plugin/marketplace.json',
      'plugins/authlane',
    ]) {
      expect(readme).toContain(`\`${value}\``);
    }
  });
});
