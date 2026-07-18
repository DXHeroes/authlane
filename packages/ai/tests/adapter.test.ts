import {
  type CredentialMaterial,
  type IntegrationAdapter,
  SUPPORTED_SERVICE_IDS,
} from '@authlane/shared';
import { describe, expect, it, vi } from 'vitest';
import { createBuiltInAdapter } from '../src/index.js';

const oauthLease = {
  type: 'oauth2' as const,
  leaseId: 'lease_123',
  accessToken: 'oauth-secret',
  tokenType: 'Bearer',
  scopes: ['repo:read'],
  expiresAt: '2026-07-18T12:00:00.000Z',
};

const apiKeyLease = {
  type: 'api_key' as const,
  leaseId: 'lease_456',
  value: 'api-secret',
  placement: { type: 'header' as const, name: 'X-API-Key', prefix: 'Bearer' },
  expiresAt: '2026-07-18T12:00:00.000Z',
};

const input = {
  externalUserId: 'user_123',
  serviceId: 'github',
  toolName: 'github_list_repos',
  arguments: { visibility: 'private' },
  credential: oauthLease,
};

function customIntegration(
  serviceId: string,
  execute: IntegrationAdapter['execute']
): IntegrationAdapter {
  return { serviceId, definitions: [], execute };
}

describe('createBuiltInAdapter', () => {
  it('prefers an explicit custom integration and executes locally', async () => {
    const execute = vi.fn(async () => ({ data: { ok: true }, error: null }));
    const custom = customIntegration('github', execute);
    const adapter = createBuiltInAdapter(({ tools }) => tools, { integrations: [custom] });

    const result = await adapter.execute(input);

    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(
      'github_list_repos',
      { visibility: 'private' },
      {
        type: 'oauth2',
        accessToken: 'oauth-secret',
        tokenType: 'Bearer',
        scopes: ['repo:read'],
        expiresAt: '2026-07-18T12:00:00.000Z',
      }
    );
    expect(result).toEqual({ data: { ok: true }, error: null });
  });

  it('snapshots custom integrations and deterministically lets the last duplicate win', async () => {
    const first = vi.fn(async () => ({ data: 'first', error: null }));
    const last = vi.fn(async () => ({ data: 'last', error: null }));
    const replacement = vi.fn(async () => ({ data: 'replacement', error: null }));
    const mutable = customIntegration('github', last);
    const integrations = [customIntegration('github', first), mutable];
    const adapter = createBuiltInAdapter(({ tools }) => tools, { integrations });

    mutable.serviceId = 'slack';
    mutable.execute = replacement;
    integrations.splice(0, integrations.length);

    const result = await adapter.execute(input);

    expect(result).toEqual({ data: 'last', error: null });
    expect(last).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
  });

  it('preserves a class integration receiver with private and prototype state', async () => {
    class StatefulIntegration implements IntegrationAdapter {
      readonly serviceId = 'github';
      readonly definitions = [];
      readonly #marker = 'private-state';

      private resultFromPrototype(): string {
        return this.#marker;
      }

      async execute(
        _toolName: string,
        _arguments: Record<string, unknown>,
        _credential: CredentialMaterial
      ) {
        return { data: this.resultFromPrototype(), error: null };
      }
    }

    const custom = new StatefulIntegration();
    const adapter = createBuiltInAdapter(({ tools }) => tools, { integrations: [custom] });

    const result = await adapter.execute(input);

    expect(result).toEqual({ data: 'private-state', error: null });
  });

  it('preserves callable integration identity as the execute receiver', async () => {
    type CallableIntegration = IntegrationAdapter & (() => void) & { marker: string };
    const custom = function callableIntegration() {} as CallableIntegration;
    custom.serviceId = 'github';
    custom.definitions = [];
    custom.marker = 'function-object';
    custom.execute = async function execute(this: CallableIntegration) {
      return {
        data: { marker: this.marker, sameReceiver: this === custom },
        error: null,
      };
    };
    const adapter = createBuiltInAdapter(({ tools }) => tools, { integrations: [custom] });

    const result = await adapter.execute(input);

    expect(result).toEqual({
      data: { marker: 'function-object', sameReceiver: true },
      error: null,
    });
  });

  it('converts API-key leases without forwarding lease metadata', async () => {
    let receivedCredential: CredentialMaterial | undefined;
    const custom = customIntegration('stripe', async (_toolName, _arguments, credential) => {
      receivedCredential = credential;
      return { data: { ok: true }, error: null };
    });
    const adapter = createBuiltInAdapter(({ tools }) => tools, { integrations: [custom] });

    const result = await adapter.execute({
      ...input,
      serviceId: 'stripe',
      toolName: 'stripe_list_customers',
      credential: apiKeyLease,
    });

    expect(result).toEqual({ data: { ok: true }, error: null });
    expect(receivedCredential).toEqual({ type: 'api_key', apiKey: 'api-secret' });
    expect(receivedCredential).not.toHaveProperty('leaseId');
    expect(receivedCredential).not.toHaveProperty('placement');
    expect(receivedCredential).not.toHaveProperty('expiresAt');
  });

  it('redacts thrown provider errors and credential material', async () => {
    const custom = customIntegration('github', async () => {
      throw new Error(`request rejected for ${oauthLease.accessToken}`);
    });
    const adapter = createBuiltInAdapter(({ tools }) => tools, { integrations: [custom] });

    const result = await adapter.execute(input);
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      data: null,
      error: { code: 'PROVIDER_REQUEST_FAILED', message: 'Provider request failed' },
    });
    expect(serialized).not.toContain(oauthLease.accessToken);
    expect(serialized).not.toContain('request rejected');
  });

  it('redacts errors returned by integrations', async () => {
    const custom = customIntegration('github', async () => ({
      data: null,
      error: {
        code: 'UPSTREAM_ERROR',
        message: `provider returned ${oauthLease.accessToken}`,
        hint: `retry with ${oauthLease.accessToken}`,
      },
    }));
    const adapter = createBuiltInAdapter(({ tools }) => tools, { integrations: [custom] });

    const result = await adapter.execute(input);
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      data: null,
      error: { code: 'PROVIDER_REQUEST_FAILED', message: 'Provider request failed' },
    });
    expect(serialized).not.toContain(oauthLease.accessToken);
    expect(serialized).not.toContain('UPSTREAM_ERROR');
  });

  it('returns a fixed safe error for malformed credentials', async () => {
    const execute = vi.fn(async () => ({ data: { ok: true }, error: null }));
    const adapter = createBuiltInAdapter(({ tools }) => tools, {
      integrations: [customIntegration('github', execute)],
    });
    const malformed = {
      ...oauthLease,
      accessToken: '',
      scopes: ['repo:read', 42],
    };

    const result = await adapter.execute({
      ...input,
      credential: malformed as never,
    });

    expect(result).toMatchObject({
      data: null,
      error: { code: 'INVALID_CREDENTIAL_MATERIAL', message: 'Credential material is invalid' },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('repo:read');
  });

  it('returns INTEGRATION_NOT_FOUND for unknown services', async () => {
    const adapter = createBuiltInAdapter(({ tools }) => tools);

    const result = await adapter.execute({ ...input, serviceId: 'unknown-service' });

    expect(result).toMatchObject({
      data: null,
      error: {
        code: 'INTEGRATION_NOT_FOUND',
        message: 'No local adapter for requested service',
      },
    });
  });

  it('lazily resolves every supported built-in integration', async () => {
    const adapter = createBuiltInAdapter(({ tools }) => tools);

    for (const serviceId of SUPPORTED_SERVICE_IDS) {
      const result = await adapter.execute({
        ...input,
        serviceId,
        toolName: '__authlane_missing_tool__',
      });
      expect(result.error?.code, serviceId).toBe('PROVIDER_REQUEST_FAILED');
      expect(JSON.stringify(result), serviceId).not.toContain(oauthLease.accessToken);
    }
  });
});
