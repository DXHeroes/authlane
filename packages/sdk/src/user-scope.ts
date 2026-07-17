import { isValidUserId } from '@authlane/shared';
import { Errors } from './errors.js';
import type { CapabilitiesResource } from './resources/capabilities.js';
import type { ConnectionsResource } from './resources/connections.js';
import type { CredentialLeasesResource } from './resources/credential-leases.js';
import type { ToolsResource } from './resources/tools.js';
import type {
  Result,
  UserScopeCapabilities,
  UserScopeConnections,
  UserScopeCredentialLeases,
  UserScopeTools,
} from './types.js';

interface UserScopeResources {
  connections: ConnectionsResource;
  capabilities: CapabilitiesResource;
  tools: ToolsResource;
  credentialLeases: CredentialLeasesResource;
}

export class UserScope {
  readonly connections: UserScopeConnections;
  readonly capabilities: UserScopeCapabilities;
  readonly tools: UserScopeTools;
  readonly credentialLeases: UserScopeCredentialLeases;

  constructor(externalUserId: string, resources: UserScopeResources) {
    const validationError = isValidUserId(externalUserId)
      ? null
      : Errors.validationError('Invalid external user ID');
    const run = <T>(operation: () => Promise<Result<T>>): Promise<Result<T>> =>
      validationError ? Promise.resolve({ data: null, error: validationError }) : operation();

    this.connections = {
      list: () => run(() => resources.connections.list({ externalUserId })),
      get: (serviceId) => run(() => resources.connections.get({ externalUserId, serviceId })),
    };
    this.capabilities = {
      get: ({ format } = {}) => run(() => resources.capabilities.get({ externalUserId, format })),
    };
    this.tools = {
      list: ({ format } = {}) => run(() => resources.tools.list({ externalUserId, format })),
    };
    this.credentialLeases = {
      create: ({ serviceId }) =>
        run(() => resources.credentialLeases.create({ externalUserId, serviceId })),
    };
  }
}
