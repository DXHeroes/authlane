import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '..');
const removedServiceName = ['sen', 'try'].join('');

function trackedTextFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
}

describe('removed service contract', () => {
  it('contains no tracked references to the removed service or its SDK', () => {
    const staleFiles = trackedTextFiles().flatMap((file) => {
      try {
        const contents = readFileSync(resolve(repositoryRoot, file), 'utf8');
        return contents.toLowerCase().includes(removedServiceName) ? [file] : [];
      } catch {
        return [];
      }
    });

    expect(staleFiles).toEqual([]);
  });
});
