import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '..');
const staleAuthlaneLicenseClaim =
  /Elastic License|ELv2|Elastic-2\.0|cannot offer Authlane as a managed service|can't offer (?:it|Authlane) as (?:a )?(?:managed service|SaaS)|❌\s*Offer as a competing SaaS|Authlane[^\n]{0,120}restricted SaaS/i;

function isThirdPartyLicenseNotice(file: string): boolean {
  return (
    /(?:^|\/)(?:vendor|third[-_]?party)\//i.test(file) ||
    /(?:^|\/)third[-_]?party[-_]?notices?(?:\.[^/]*)?$/i.test(file)
  );
}

function trackedTextFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)
    .filter(
      (file) => file !== 'scripts/license-contract.test.ts' && !isThirdPartyLicenseNotice(file)
    );
}

describe('Authlane licensing contract', () => {
  it('publishes the canonical MIT license for Authlane contributors', () => {
    const license = readFileSync(resolve(repositoryRoot, 'LICENSE'), 'utf8');
    const packageManifest = JSON.parse(
      readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')
    ) as { license?: string };

    expect(packageManifest.license).toBe('MIT');
    expect(license).toContain('MIT License');
    expect(license).toContain('Copyright (c) 2026 Authlane contributors');
    expect(license).toContain('Permission is hereby granted, free of charge');
  });

  it('contains no stale Authlane ELv2 or managed-service restriction claims', () => {
    const staleClaims = trackedTextFiles().flatMap((file) => {
      let contents: string;
      try {
        contents = readFileSync(resolve(repositoryRoot, file), 'utf8');
      } catch {
        return [];
      }
      return staleAuthlaneLicenseClaim.test(contents) ? [file] : [];
    });

    expect(staleClaims).toEqual([]);
  });

  it('recognizes historical Authlane SaaS restriction phrasing', () => {
    expect(staleAuthlaneLicenseClaim.test('❌ Offer as a competing SaaS')).toBe(true);
    expect(staleAuthlaneLicenseClaim.test('Authlane is fully open but restricted SaaS')).toBe(true);
    expect(isThirdPartyLicenseNotice('THIRD_PARTY_NOTICES.md')).toBe(true);
    expect(isThirdPartyLicenseNotice('internal/notice.md')).toBe(false);
  });
});
