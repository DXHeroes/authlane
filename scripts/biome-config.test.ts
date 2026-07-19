import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const repositoryArtifactDirectories = [
  '.claude',
  '.playwright-cli',
  '.superpowers',
  '.worktrees',
  '.venv',
  'output',
  'playwright-report',
  'test-results',
] as const;

const generatedDirectories = ['dist-server', 'out'] as const;
const generatedByteFixtures = [
  'apps/api/tests/fixtures/landing/_next/static/authlane-next-flight-0123456789ab.js',
] as const;

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
    for (const fixture of generatedByteFixtures) {
      expect(biomeConfig.files?.includes).toContain(`!!${fixture}`);
    }
    expect(packageJson.scripts?.['format:check']).toBe('node scripts/run-biome-tracked.mjs format');
    expect(packageJson.scripts?.lint).toBe('node scripts/run-biome-tracked.mjs lint');
  });
});
