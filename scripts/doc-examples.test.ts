import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '..');

/**
 * Compiles the documentation's code and fails the suite when it does not build.
 *
 * This lives in the test suite rather than in `docs:check`: that script runs inside the landing
 * app's `prebuild`, and therefore inside the production image, where the framework packages the
 * examples import are not installed. A gate that only the release build can trip is worse than no
 * gate — it stops a deploy over documentation.
 */
describe('documentation examples', () => {
  it('compiles', () => {
    const result = spawnSync('node', ['scripts/check-doc-examples.mjs'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });

    expect(`${result.stdout}${result.stderr}`.trim()).toContain('Documentation examples check out');
    expect(result.status).toBe(0);
  }, 120_000);
});
