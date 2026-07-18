import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const openApi = readFileSync(
  new URL('../../../docs/api-reference/openapi.yaml', import.meta.url),
  'utf8'
);

describe('OpenAPI credential security contract', () => {
  it('documents only POST credential leases with the issuing scope', () => {
    expect(openApi).toContain(
      '/api/v1/users/{externalUserId}/connections/{serviceId}/credential-leases:'
    );
    expect(openApi).toContain('operationId: createCredentialLease');
    expect(openApi).toContain('x-authlane-scope: credentials:issue');
    expect(openApi).toContain('const: no-store, private');
    expect(openApi).not.toContain(
      '/api/v1/users/{externalUserId}/connections/{serviceId}/credentials:'
    );
    expect(openApi).not.toContain('refreshToken:');
    expect(openApi).not.toContain('idToken:');
  });

  it('allows duplicate explicit connect-session service IDs for server-side deduplication', () => {
    expect(openApi).not.toContain('uniqueItems: true');
  });
});
