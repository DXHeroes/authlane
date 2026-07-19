import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '..');
const publicSourceExtensions = new Set(['.json', '.md', '.mdx', '.ts', '.tsx', '.yaml', '.yml']);
const forbiddenPublicLinks =
  /authlane\.dev|docs\.authlane\.com|authlane\.example\.com|github\.com\/authlane\/authlane|discord\.gg\/authlane|app\.authlane\.io\/docs/i;
const publicFiles = [
  'README.md',
  'apps/landing/app/content.ts',
  'apps/landing/app/not-found.tsx',
  ...collectPublicSourceFiles('apps/docs'),
  ...collectPublicSourceFiles('packages/email/src'),
  ...collectPublicSourceFiles('packages/sdk/src'),
  ...collectPublicSourceFiles('packages/shared/src'),
] as const;

function collectPublicSourceFiles(directory: string): string[] {
  return readdirSync(resolve(repositoryRoot, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectPublicSourceFiles(path);
      if (!entry.isFile() || !publicSourceExtensions.has(extname(entry.name))) return [];
      if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) return [];
      return [path];
    })
    .sort((left, right) => left.localeCompare(right));
}

describe('canonical documentation domain', () => {
  it('keeps repository-owned public sources on canonical Authlane destinations', () => {
    const stale: string[] = [];
    for (const file of publicFiles) {
      const source = readFileSync(resolve(repositoryRoot, file), 'utf8');
      if (forbiddenPublicLinks.test(source)) stale.push(relative(repositoryRoot, file));
    }

    expect(stale).toEqual([]);
  });
});
