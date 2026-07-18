import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const openApi = readFileSync(
  new URL('../../../docs/api-reference/openapi.yaml', import.meta.url),
  'utf8'
);

const REQUIRED_OPERATION_IDS = [
  'listCatalogServices',
  'listUserConnections',
  'getUserCapabilities',
  'listUserTools',
  'createCredentialLease',
  'createConnectSession',
  'getHostedConnectSession',
  'authorizeConnection',
  'disconnectConnection',
  'oauthCallback',
] as const;

describe('Task 04 OpenAPI 3.1 contract', () => {
  it('describes the complete public control-plane surface with stable operation IDs', () => {
    expect(openApi).toMatch(/^openapi: 3\.1\.0$/m);
    expect(openApi).toContain('url: https://app.authlane.io');
    expect(openApi).toContain('url: http://localhost:3000');

    for (const operationId of REQUIRED_OPERATION_IDS) {
      expect(openApi, operationId).toContain(`operationId: ${operationId}`);
    }

    expect(openApi).toContain('/api/v1/connect/session:');
    expect(openApi).toContain('/api/v1/connect/{serviceId}:');
    expect(openApi).toContain('/api/v1/oauth/{serviceId}/callback:');
    expect(openApi).not.toContain('/api/v1/dashboard');
  });

  it('publishes the signed lifecycle webhook contract', () => {
    expect(openApi).toMatch(/^webhooks:$/m);
    for (const event of [
      'connection.connected',
      'connection.disconnected',
      'connection.expired',
      'connection.refreshed',
      'connection.error',
    ]) {
      expect(openApi, event).toContain(`- ${event}`);
    }
    for (const header of [
      'X-Authlane-Signature',
      'X-Authlane-Timestamp',
      'X-Authlane-Event',
      'Idempotency-Key',
    ]) {
      expect(openApi, header).toContain(header);
    }
    expect(openApi).toContain('HMAC-SHA256');
  });

  it('locks external users and empty allowedServices semantics without rejecting duplicates', () => {
    expect(openApi).toContain('externalUserId:');
    expect(openApi).toContain('maxLength: 255');
    expect(openApi).toContain(
      'An empty array snapshots all services currently enabled for the tenant.'
    );
    expect(openApi).not.toContain('uniqueItems: true');
  });

  it('matches the runtime AuthlaneError optional fields', () => {
    const schema = openApi.slice(
      openApi.indexOf('    AuthlaneError:'),
      openApi.indexOf('    ErrorResult:')
    );

    expect(schema).toContain('required: [message, code]');
    expect(schema).toContain('hint:');
    expect(schema).toContain('docUrl:');
    expect(schema).toContain('statusCode:');
    expect(schema).not.toContain('required: [message, code, hint, docUrl]');
  });
});
