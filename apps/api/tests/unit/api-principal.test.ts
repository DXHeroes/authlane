import { describe, expect, it } from 'vitest';
import { hasRequiredScope, normalizeApiScopes } from '../../src/lib/api-principal.js';

describe('API principal scopes', () => {
  it('accepts only known scopes', () => {
    expect(
      normalizeApiScopes(['catalog:read', 'credentials:read', 'tools:execute', 'unknown'])
    ).toEqual(['catalog:read', 'credentials:read']);
  });

  it('allows a dashboard session to use every control-plane route', () => {
    expect(
      hasRequiredScope(
        { kind: 'session', organizationId: 'org_1', apiKeyId: null, scopes: [] },
        'credentials:read'
      )
    ).toBe(true);
  });

  it('requires an explicit scope for an API key', () => {
    const principal = {
      kind: 'api_key' as const,
      organizationId: 'org_1',
      apiKeyId: 'key_1',
      scopes: ['connections:read' as const],
    };

    expect(hasRequiredScope(principal, 'connections:read')).toBe(true);
    expect(hasRequiredScope(principal, 'credentials:read')).toBe(false);
  });
});
