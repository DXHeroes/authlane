import type { UserToolAdapterOptions } from './user-tools.js';

export type Result<T, E = AuthlaneError> = { data: T; error: null } | { data: null; error: E };

export interface AuthlaneError {
  message: string;
  code: string;
  hint?: string;
  docUrl?: string;
  statusCode?: number;
}

export interface AuthlaneConfig {
  /** Server-side scoped API key. Never expose this value to a browser. */
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  fetch?: typeof fetch;
}

export type ConnectionStatus = 'disconnected' | 'pending' | 'connected' | 'expired' | 'error';
export type ToolFormat = 'mcp' | 'openai';
export type ToolAccessPolicy = 'read_only' | 'full';
export type ToolRisk = 'read' | 'write' | 'destructive';

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

/** Why a listed service cannot be connected right now, and what its owner has to fix. */
export type NotConnectableReason =
  | 'missing_oauth_client'
  | 'missing_authorization_url'
  | 'disabled';

export interface Service {
  id: string;
  name: string;
  authType: string;
  /** A service from Authlane's global catalog, or an MCP server this workspace registered. */
  kind: 'service' | 'mcp_server';
  enabled: boolean;
  /**
   * Whether starting a connection for this service would work right now.
   *
   * A service can be listed and enabled and still be unconnectable — most often because nobody has
   * registered an OAuth application for it. Offering such a service in a UI produces a failure at
   * the moment the user clicks, with nothing said beforehand, so check this before you render it.
   */
  connectable: boolean;
  /** Present exactly when `connectable` is false. */
  notConnectableReason?: NotConnectableReason;
  toolAccessPolicy: ToolAccessPolicy;
  config: Record<string, unknown>;
}

export interface Connection {
  serviceId: string;
  status: ConnectionStatus;
  connected: boolean;
  expiresAt: string | null;
  connectedAt: string | null;
  lastCheckedAt: string | null;
  errorCode: string | null;
}

export type CredentialPlacement =
  | { type: 'header'; name: string; prefix?: string }
  | { type: 'query'; name: string };

export type CredentialLease =
  | {
      type: 'oauth2';
      leaseId: string;
      accessToken: string;
      tokenType: string;
      scopes: string[];
      expiresAt: string | null;
      providerContext?: { apiBaseUrl: string };
    }
  | {
      type: 'api_key';
      leaseId: string;
      value: string;
      placement: CredentialPlacement;
      expiresAt: string | null;
    };

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: ToolAnnotations;
}

export interface OpenAIFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  metadata: {
    authlane: {
      serviceId: string;
      risk: ToolRisk;
      annotations: ToolAnnotations;
    };
  };
}

export type ToolsResponse =
  | { tools: MCPTool[]; version: string }
  | { functions: OpenAIFunction[]; version: string };

export interface CapabilityService {
  serviceId: string;
  status: ConnectionStatus;
  connected: boolean;
  expiresAt: string | null;
  toolAccessPolicy: ToolAccessPolicy;
  tools: MCPTool[] | OpenAIFunction[];
}

export interface CapabilitiesResponse {
  externalUserId: string;
  format: ToolFormat;
  version: string;
  services: CapabilityService[];
}

export interface ConnectSessionResponse {
  id: string;
  token: string;
  url: string;
  expiresAt: string;
}

export interface ExternalUserOptions {
  externalUserId: string;
}

export interface UserServiceOptions extends ExternalUserOptions {
  serviceId: string;
}

export interface ToolOptions extends ExternalUserOptions {
  format?: ToolFormat;
}

export type UserScopeToolOptions = Omit<ToolOptions, 'externalUserId'> & {
  externalUserId?: never;
  adapter?: never;
};
export type UserScopeServiceOptions = Omit<UserServiceOptions, 'externalUserId'> & {
  externalUserId?: never;
};

export interface UserScopeConnections {
  list(): Promise<Result<Connection[]>>;
  get(serviceId: string): Promise<Result<Connection>>;
}

export interface UserScopeCapabilities {
  get(options?: UserScopeToolOptions): Promise<Result<CapabilitiesResponse>>;
}

export interface UserScopeTools {
  list<T>(options: UserToolAdapterOptions<T>): Promise<Result<T>>;
  list(options?: UserScopeToolOptions): Promise<Result<ToolsResponse>>;
}

export interface UserScopeCredentialLeases {
  create(options: UserScopeServiceOptions): Promise<Result<CredentialLease>>;
}

export interface CreateConnectSessionOptions extends ExternalUserOptions {
  /** Concrete service IDs to snapshot. An empty array snapshots every currently enabled tenant service. */
  allowedServices: string[];
  allowedOrigin: string;
  expiresInSeconds?: number;
  /** ISO timestamp set only after the tenant has just reauthenticated the end-user. */
  reauthenticatedAt?: string;
}
