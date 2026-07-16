import { describe, expect, it } from 'vitest';
import { hasRequiredScope, normalizeApiScopes } from '../../src/lib/api-principal.js';

describe('API principal scopes', () => {
  it('accepts only known scopes', () => {
    expect(
      normalizeApiScopes(['catalog:read', 'credentials:issue', 'tools:execute', 'unknown'])
    ).toEqual(['catalog:read', 'credentials:issue']);
  });

  it('does not grant machine scopes to a dashboard session', () => {
    expect(
      hasRequiredScope(
        { kind: 'session', organizationId: 'org_1', apiKeyId: null, scopes: [] },
        'credentials:issue'
      )
    ).toBe(false);
  });

  it('requires an explicit scope for an API key', () => {
    const principal = {
      kind: 'api_key' as const,
      organizationId: 'org_1',
      apiKeyId: 'key_1',
      scopes: ['connections:read' as const],
    };

    expect(hasRequiredScope(principal, 'connections:read')).toBe(true);
    expect(hasRequiredScope(principal, 'credentials:issue')).toBe(false);
  });
});
