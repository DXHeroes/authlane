import { Errors } from '@authlane/shared';
import type { Context, Next } from 'hono';
import type { ApiScope } from '../lib/api-principal.js';
import { hasRequiredScope } from '../lib/api-principal.js';

export function requireScope(scope: ApiScope) {
  return async (c: Context, next: Next) => {
    if (!hasRequiredScope(c.get('principal'), scope)) {
      return c.json(Errors.unauthorized(`API key requires the ${scope} scope`), 403);
    }

    await next();
  };
}
