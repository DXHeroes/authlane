export const API_SCOPES = [
  'catalog:read',
  'connections:read',
  'credentials:issue',
  'connect-sessions:create',
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export const DEFAULT_API_SCOPES = [
  'catalog:read',
  'connections:read',
  'connect-sessions:create',
] as const satisfies readonly ApiScope[];

const knownScopes = new Set<string>(API_SCOPES);

export function normalizeApiScopes(scopes: unknown): ApiScope[] {
  if (!Array.isArray(scopes)) return [];
  return scopes.filter(
    (scope): scope is ApiScope => typeof scope === 'string' && knownScopes.has(scope)
  );
}
