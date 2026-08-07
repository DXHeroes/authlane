import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const openApi = readFileSync(
  new URL('../../../docs/api-reference/openapi.yaml', import.meta.url),
  'utf8'
);
const controlPlaneRuntime = readFileSync(
  new URL('../../src/routes/control-plane.ts', import.meta.url),
  'utf8'
);
const oauthRuntime = readFileSync(new URL('../../src/routes/oauth.ts', import.meta.url), 'utf8');
const outboxRuntime = readFileSync(new URL('../../src/jobs/outbox.ts', import.meta.url), 'utf8');

function section(start: string, end: string): string {
  const startIndex = openApi.indexOf(start);
  const endIndex = openApi.indexOf(end, startIndex + start.length);
  expect(startIndex, `missing OpenAPI section ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `missing OpenAPI section boundary ${end}`).toBeGreaterThan(startIndex);
  return openApi.slice(startIndex, endIndex);
}

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
  'getSandboxContext',
  'runSandboxTool',
  'runSandboxAgent',
] as const;

describe('Task 04 OpenAPI 3.1 contract', () => {
  it('describes the complete control-plane and protected dashboard surface with stable operation IDs', () => {
    expect(openApi).toMatch(/^openapi: 3\.1\.0$/m);
    expect(openApi).toContain('url: https://app.authlane.io');
    expect(openApi).toContain('url: http://localhost:3000');

    for (const operationId of REQUIRED_OPERATION_IDS) {
      expect(openApi, operationId).toContain(`operationId: ${operationId}`);
    }

    expect(openApi).toContain('/api/v1/connect/session:');
    expect(openApi).toContain('/api/v1/connect/{serviceId}:');
    expect(openApi).toContain('/api/v1/oauth/{serviceId}/callback:');
    expect(openApi).toContain('/api/v1/dashboard/sandbox:');
    expect(openApi).toContain('DashboardSession:');
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

  it('matches the source-captured tools response for MCP and OpenAI formats', () => {
    expect(controlPlaneRuntime).toContain(
      'return c.json({ data: { ...definitions, version }, error: null });'
    );

    const schema = section('    ToolsResult:', '    CredentialLeaseResult:');
    expect(schema).toContain('required: [tools, version]');
    expect(schema).toContain('required: [functions, version]');
    expect(schema).not.toContain('externalUserId:');
    expect(schema).not.toContain('format:');
  });

  it('matches the source-captured hosted session service shape and required action body', () => {
    expect(oauthRuntime).toContain('return { ...service, status };');
    expect(oauthRuntime).toContain('if (!token || !body.parentOrigin)');

    const operation = section(
      '  /api/v1/connect/session:',
      '  /api/v1/connect/{serviceId}/authorize:'
    );
    expect(operation).toContain('requestBody:');
    expect(operation).toContain("$ref: '#/components/schemas/ConnectAction'");

    const schema = section('    HostedConnectSessionResult:', '    ConnectAction:');
    expect(schema).toContain('required: [externalUserId, services, expiresAt]');
    expect(schema).toContain("$ref: '#/components/schemas/HostedConnectService'");
    expect(schema).not.toContain('allowedOrigin:');

    const service = section('    HostedConnectService:', '    HostedConnectSessionResult:');
    expect(service).toContain('required: [id, name, authType, status]');
  });

  it('matches the source-captured disconnect result', () => {
    expect(oauthRuntime).toContain(
      'return c.json({ data: { disconnected: Boolean(deleted) }, error: null });'
    );

    const schema = section('    DisconnectResult:', '    SandboxToolDefinition:');
    expect(schema).toContain('required: [disconnected]');
    expect(schema).toContain('disconnected:');
    expect(schema).not.toContain("$ref: '#/components/schemas/Connection'");
  });

  it('matches the source-captured webhook envelope', () => {
    for (const runtimeField of [
      'id: event.id',
      'type: event.eventType',
      'createdAt: event.createdAt.toISOString()',
      'data: event.payload',
    ]) {
      expect(outboxRuntime, runtimeField).toContain(runtimeField);
    }

    const schema = section('    WebhookEvent:', '    WebhookEventData:');
    expect(schema).toContain('required: [id, type, createdAt, data]');
    expect(schema).toContain('type:');
    expect(schema).toContain('data:');
    expect(schema).not.toContain('event:');
    expect(schema).not.toContain('externalUserId:');
    expect(schema).not.toContain('serviceId:');
  });

  it('includes representative request, response, error, and webhook examples', () => {
    for (const example of [
      'CatalogResponseExample:',
      'ToolsResponseExample:',
      'CreateConnectSessionRequestExample:',
      'CreateConnectSessionResponseExample:',
      'HostedConnectSessionRequestExample:',
      'HostedConnectSessionResponseExample:',
      'DisconnectResponseExample:',
      'ErrorResponseExample:',
      'ConnectionWebhookExample:',
    ]) {
      expect(openApi, example).toContain(example);
    }

    const webhook = section('webhooks:', 'components:');
    expect(webhook).toContain("$ref: '#/components/examples/ConnectionWebhookExample'");
  });

  it('documents source-captured 404/409 statuses and excludes impossible hosted statuses', () => {
    expect(oauthRuntime).toContain(
      "return c.json(errorResult(Errors.notFound('Enabled service', serviceId)), 404);"
    );
    // The two branches once threw byte-identical text, so a caller could not tell an
    // unconfigurable MCP server from an unconfigurable built-in service. Each now names its cause.
    expect(oauthRuntime).toContain(
      'return c.json(errorResult(mcpAuthorizationConflict(resolution.reason)), 409);'
    );
    expect(oauthRuntime).toContain(
      'return c.json(errorResult(builtInAuthorizationConflict(serviceId, resolution.reason)), 409);'
    );
    expect(oauthRuntime).toContain(
      "errorResult(Errors.oauthError('OAuth provider is no longer configured'))"
    );

    const authorize = section(
      '  /api/v1/connect/{serviceId}/authorize:',
      '  /api/v1/connect/{serviceId}:'
    );
    expect(authorize).toContain("'404':");
    expect(authorize).toContain("'409':");

    const callback = section(
      '  /api/v1/oauth/{serviceId}/callback:',
      '  /api/v1/dashboard/sandbox:'
    );
    expect(callback).toContain("'409':");

    const hostedSession = section(
      '  /api/v1/connect/session:',
      '  /api/v1/connect/{serviceId}/authorize:'
    );
    expect(hostedSession).not.toContain("'410':");

    const disconnect = section(
      '  /api/v1/connect/{serviceId}:',
      '  /api/v1/oauth/{serviceId}/callback:'
    );
    expect(disconnect).not.toContain("'409':");
  });

  it('documents global runtime rate-limit headers and 429 responses on every operation', () => {
    for (const header of [
      "c.header('X-RateLimit-Limit'",
      "c.header('X-RateLimit-Remaining'",
      "c.header('X-RateLimit-Reset'",
    ]) {
      expect(
        readFileSync(new URL('../../src/middleware/rate-limit.ts', import.meta.url), 'utf8'),
        header
      ).toContain(header);
    }

    const operationStarts = REQUIRED_OPERATION_IDS.map((operationId) =>
      openApi.lastIndexOf('\n', openApi.indexOf(`operationId: ${operationId}`))
    );
    for (const operationId of REQUIRED_OPERATION_IDS) {
      const operationIndex = openApi.indexOf(`operationId: ${operationId}`);
      const nextOperation = operationStarts
        .filter((index) => index > operationIndex)
        .sort((left, right) => left - right)[0];
      const operation = openApi.slice(
        operationIndex,
        nextOperation ?? openApi.indexOf('webhooks:')
      );
      expect(operation, operationId).toContain("'429':");
    }

    expect(openApi).toContain('headers: &RateLimitedSuccessHeaders');
    expect(openApi).toContain('headers: *RateLimitedSuccessHeaders');
  });
});
