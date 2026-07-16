import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('email package distribution', () => {
  it('loads in the native Node ESM runtime', async () => {
    const result = await execFileAsync(
      process.execPath,
      ['--input-type=module', '--eval', "await import('./dist/index.js')"],
      { cwd: new URL('..', import.meta.url) }
    );

    expect(result.stderr).toBe('');
  });
});
