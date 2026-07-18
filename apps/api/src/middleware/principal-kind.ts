import { Errors } from '@authlane/shared';
import type { Context, Next } from 'hono';
import type { ApiPrincipal } from '../lib/api-principal.js';
import { errorResult } from '../lib/api-response.js';

export function requirePrincipalKind(kind: ApiPrincipal['kind']) {
  return async (c: Context, next: Next) => {
    if (c.get('principal').kind !== kind) {
      return c.json(
        errorResult(
          Errors.insufficientScope(
            kind === 'session'
              ? 'This endpoint requires an authenticated dashboard session'
              : 'This endpoint requires a scoped server-side API key'
          )
        ),
        403
      );
    }

    await next();
  };
}
