import type { UserToolAdapter } from '@authlane/sdk';
import {
  type CredentialMaterial,
  createError,
  type IntegrationAdapter,
  type Result,
  validateOAuthProviderContext,
} from '@authlane/shared';
import { resolveIntegration, snapshotCustomIntegrations } from './integrations.js';
import {
  createProviderMcpClient,
  executePreferredProviderMcp,
  type ProviderMcpClientFactory,
} from './provider-mcp.js';

export interface FrameworkAdapterOptions {
  integrations?: IntegrationAdapter[];
  providerMcp?: 'prefer' | 'disabled';
  providerMcpClientFactory?: ProviderMcpClientFactory;
  providerMcpForCustomIntegrations?: boolean;
  approval?: ApprovalPolicy;
}

export type ApprovalPolicy = 'none' | 'destructive' | 'write-and-destructive';

export function requiresApproval(
  risk: 'read' | 'write' | 'destructive',
  policy: ApprovalPolicy = 'none'
): boolean {
  if (policy === 'write-and-destructive') return risk !== 'read';
  return policy === 'destructive' && risk === 'destructive';
}

const invalidCredentialError = () =>
  safeError('INVALID_CREDENTIAL_MATERIAL', 'Credential material is invalid');

function safeError(code: string, message: string): Result<never> {
  return { data: null, error: createError(message, code) };
}

function ownDataValue(value: object, property: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, property);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function copyScopes(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const length = ownDataValue(value, 'length');
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > 1_000) {
    return null;
  }

  const scopes: string[] = [];
  for (let index = 0; index < length; index += 1) {
    const scope = ownDataValue(value, index);
    if (typeof scope !== 'string') {
      return null;
    }
    scopes.push(scope);
  }
  return scopes;
}

function toCredentialMaterial(value: unknown, serviceId: string): CredentialMaterial | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  try {
    const type = ownDataValue(value, 'type');
    if (type === 'oauth2') {
      const accessToken = ownDataValue(value, 'accessToken');
      const tokenType = ownDataValue(value, 'tokenType');
      const rawScopes = ownDataValue(value, 'scopes');
      const expiresAt = ownDataValue(value, 'expiresAt');
      const rawProviderContext = ownDataValue(value, 'providerContext');
      const scopes = copyScopes(rawScopes);
      if (
        typeof accessToken !== 'string' ||
        accessToken.length === 0 ||
        typeof tokenType !== 'string' ||
        tokenType.length === 0 ||
        scopes === null ||
        (expiresAt !== null && typeof expiresAt !== 'string')
      ) {
        return null;
      }
      const providerContext = validateOAuthProviderContext(serviceId, rawProviderContext);
      return {
        type,
        accessToken,
        tokenType,
        scopes,
        expiresAt,
        ...(providerContext ? { providerContext } : {}),
      };
    }

    if (type === 'api_key') {
      const apiKey = ownDataValue(value, 'value');
      if (typeof apiKey !== 'string' || apiKey.length === 0) {
        return null;
      }
      return { type, apiKey };
    }
  } catch {
    return null;
  }

  return null;
}

function successfulData(
  value: unknown
): { readonly ok: true; readonly data: unknown } | { readonly ok: false } {
  if (typeof value !== 'object' || value === null) {
    return { ok: false };
  }

  try {
    const error = ownDataValue(value, 'error');
    const dataDescriptor = Object.getOwnPropertyDescriptor(value, 'data');
    if (error !== null || !dataDescriptor || !('value' in dataDescriptor)) {
      return { ok: false };
    }
    return { ok: true, data: dataDescriptor.value };
  } catch {
    return { ok: false };
  }
}

export function createBuiltInAdapter<T>(
  build: UserToolAdapter<T>['build'],
  options: FrameworkAdapterOptions = {}
): UserToolAdapter<T> {
  const customIntegrations = snapshotCustomIntegrations(options.integrations);

  return {
    format: 'mcp',
    build,
    async execute(input) {
      const credential = toCredentialMaterial(input.credential, input.serviceId);
      if (!credential) {
        return invalidCredentialError();
      }

      const hasCustomIntegration = customIntegrations.has(input.serviceId);
      if (
        options.providerMcp !== 'disabled' &&
        (!hasCustomIntegration || options.providerMcpForCustomIntegrations === true)
      ) {
        const providerMcp = await executePreferredProviderMcp(
          input.serviceId,
          input.toolName,
          input.arguments as Record<string, unknown>,
          credential,
          options.providerMcpClientFactory ?? createProviderMcpClient
        );
        if (providerMcp.status === 'completed') return providerMcp.result;
      }

      const resolution = await resolveIntegration(input.serviceId, customIntegrations);
      if (resolution.status === 'not_found') {
        return safeError('INTEGRATION_NOT_FOUND', 'No local adapter for requested service');
      }
      if (resolution.status === 'load_failed') {
        return safeError('INTEGRATION_LOAD_FAILED', 'Local integration adapter is unavailable');
      }

      try {
        const result = await resolution.integration.execute(
          input.toolName,
          input.arguments as Record<string, unknown>,
          credential
        );
        const success = successfulData(result);
        if (success.ok) {
          return { data: success.data, error: null };
        }
        return safeError('PROVIDER_REQUEST_FAILED', 'Provider request failed');
      } catch {
        return safeError('PROVIDER_REQUEST_FAILED', 'Provider request failed');
      }
    },
  };
}
