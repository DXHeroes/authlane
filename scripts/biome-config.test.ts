import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const repositoryArtifactDirectories = [
  '.claude',
  '.playwright-cli',
  '.superpowers',
  '.worktrees',
  'output',
  'playwright-report',
  'test-results',
] as const;

const generatedDirectories = ['dist-server', 'out'] as const;

describe('Biome repository scope', () => {
  it('excludes local artifact directories without narrowing tracked source checks', async () => {
    const [biomeConfigText, packageJsonText] = await Promise.all([
      readFile(new URL('../biome.json', import.meta.url), 'utf8'),
      readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ]);
    const biomeConfig = JSON.parse(biomeConfigText) as { files?: { includes?: string[] } };
    const packageJson = JSON.parse(packageJsonText) as { scripts?: Record<string, string> };

    expect(biomeConfig.files?.includes).toContain('**');
    for (const directory of repositoryArtifactDirectories) {
      expect(biomeConfig.files?.includes).toContain(`!!**/${directory}`);
    }
    for (const directory of generatedDirectories) {
      expect(biomeConfig.files?.includes).toContain(`!!**/${directory}`);
    }
    expect(packageJson.scripts?.['format:check']).toBe('biome format .');
    expect(packageJson.scripts?.lint).toBe('biome check .');
  });
});
