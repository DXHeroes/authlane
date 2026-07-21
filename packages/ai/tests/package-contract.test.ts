import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('@authlane/ai package contract', () => {
  it('installs the Vercel AI runtime for strict workspace linkers', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8')
    ) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.ai).toMatch(/^\^7\./);
    expect(packageJson.peerDependencies?.ai).toBeUndefined();
  });
});
