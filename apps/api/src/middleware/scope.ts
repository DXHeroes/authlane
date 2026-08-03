import { Errors } from '@authlane/shared';
import type { Context, Next } from 'hono';
import type { ApiScope } from '../lib/api-principal.js';
import { hasRequiredScope } from '../lib/api-principal.js';
import { errorResult } from '../lib/api-response.js';

export function requireScope(scope: ApiScope) {
  return async (c: Context, next: Next) => {
    if (!hasRequiredScope(c.get('principal'), scope)) {
      // Say what to do, not just what is missing: a key's scopes are fixed when it is created, so
      // the only fix is a new key. Without that sentence this reads as a settings toggle.
      return c.json(
        errorResult(
          Errors.insufficientScope(
            `This API key does not have the ${scope} scope. Scopes are fixed when a key is created, so create a new key that includes it.`
          )
        ),
        403
      );
    }

    await next();
  };
}
