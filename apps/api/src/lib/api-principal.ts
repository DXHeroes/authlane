import type { ApiScope } from '@authlane/shared';

export { API_SCOPES, DEFAULT_API_SCOPES, normalizeApiScopes } from '@authlane/shared';
export type { ApiScope } from '@authlane/shared';

export interface ApiPrincipal {
  kind: 'session' | 'api_key';
  organizationId: string;
  apiKeyId: string | null;
  scopes: ApiScope[];
}

export function hasRequiredScope(principal: ApiPrincipal, scope: ApiScope): boolean {
  return principal.kind === 'api_key' && principal.scopes.includes(scope);
}
