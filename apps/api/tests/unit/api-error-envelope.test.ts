import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Errors } from '@authlane/shared';
import { describe, expect, it } from 'vitest';
import { errorResult } from '../../src/lib/api-response.js';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicErrorSurfaces = [
  'src/index.ts',
  'src/middleware/auth.ts',
  'src/middleware/error-handler.ts',
  'src/middleware/principal-kind.ts',
  'src/middleware/scope.ts',
  'src/routes/control-plane.ts',
  'src/routes/oauth.ts',
  'src/routes/services.ts',
] as const;

describe('public API error envelopes', () => {
  it('normalizes Authlane errors to the non-throwing SDK result contract', () => {
    const error = Errors.validationError('Invalid external user ID');

    expect(errorResult(error)).toEqual({ data: null, error });
  });

  it('does not return bare Authlane errors from public SDK routes or middleware', () => {
    for (const file of publicErrorSurfaces) {
      const source = readFileSync(resolve(apiRoot, file), 'utf8');
      expect(source, file).not.toMatch(/c\.json\(Errors\./);
      expect(source, file).not.toMatch(/c\.json\(\{\s*error:\s*(?:Errors\.|authlaneError)/);
    }
  });
});
