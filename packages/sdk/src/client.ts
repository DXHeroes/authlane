import { Errors } from './errors.js';
import { CapabilitiesResource } from './resources/capabilities.js';
import { ConnectSessionsResource } from './resources/connect-sessions.js';
import { ConnectionsResource } from './resources/connections.js';
import { ServicesResource } from './resources/services.js';
import { ToolsResource } from './resources/tools.js';
import type { AuthlaneConfig } from './types.js';

export class Authlane {
  readonly connections: ConnectionsResource;
  readonly services: ServicesResource;
  readonly tools: ToolsResource;
  readonly capabilities: CapabilitiesResource;
  readonly connectSessions: ConnectSessionsResource;

  constructor(config: AuthlaneConfig) {
    if (!config.apiKey) {
      const error = Errors.missingApiKey();
      throw new Error(`${error.message} (${error.code})`);
    }
    if ('window' in globalThis) {
      throw new Error(
        'The Authlane API-key SDK is server-only. Pass a connect-session URL to browsers.'
      );
    }
    const args = [
      (config.baseUrl ?? 'https://api.authlane.com').replace(/\/$/, ''),
      config.apiKey,
      config.fetch ?? fetch,
      config.timeout ?? 30_000,
    ] as const;
    this.connections = new ConnectionsResource(...args);
    this.services = new ServicesResource(...args);
    this.tools = new ToolsResource(...args);
    this.capabilities = new CapabilitiesResource(...args);
    this.connectSessions = new ConnectSessionsResource(...args);
  }
}
