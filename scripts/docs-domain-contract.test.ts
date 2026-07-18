import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '..');
const activeFiles = [
  'apps/landing/app/content.ts',
  'apps/landing/app/not-found.tsx',
  'apps/docs/mint.json',
  'packages/email/src/templates/WelcomeEmail.tsx',
  'packages/sdk/src/errors.ts',
  'packages/shared/src/errors.ts',
  'apps/api/src/middleware/rate-limit.ts',
  'e2e/smoke.spec.ts',
] as const;

describe('canonical documentation domain', () => {
  it('keeps active links and SDK error help on authlane.io/docs', () => {
    const stale: string[] = [];
    for (const file of activeFiles) {
      const source = readFileSync(resolve(repositoryRoot, file), 'utf8');
      if (
        /https:\/\/(?:app\.authlane\.io\/docs|docs\.authlane\.(?:dev|com)|authlane\.example\.com)/.test(
          source
        )
      ) {
        stale.push(file);
      }
    }

    expect(stale).toEqual([]);
  });
});
