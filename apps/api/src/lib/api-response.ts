import type { AuthlaneError, Result } from '@authlane/shared';

export function errorResult(error: AuthlaneError): Result<never> {
  return { data: null, error };
}
