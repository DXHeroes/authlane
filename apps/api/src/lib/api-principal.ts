export const API_SCOPES = [
  'catalog:read',
  'connections:read',
  'connections:write',
  'credentials:read',
  'connect-sessions:write',
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export interface ApiPrincipal {
  kind: 'session' | 'api_key';
  organizationId: string;
  apiKeyId: string | null;
  scopes: ApiScope[];
}

const knownScopes = new Set<string>(API_SCOPES);

export function normalizeApiScopes(scopes: unknown): ApiScope[] {
  if (!Array.isArray(scopes)) {
    return [];
  }

  return scopes.filter(
    (scope): scope is ApiScope => typeof scope === 'string' && knownScopes.has(scope)
  );
}

export function hasRequiredScope(principal: ApiPrincipal, scope: ApiScope): boolean {
  return principal.kind === 'session' || principal.scopes.includes(scope);
}
