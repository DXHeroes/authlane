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

export interface Service {
  id: string;
  name: string;
  authType: string;
  enabled: boolean;
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
}

export interface OpenAIFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type ToolsResponse =
  | { tools: MCPTool[]; version: string }
  | { functions: OpenAIFunction[]; version: string };

export interface CapabilityService {
  serviceId: string;
  status: ConnectionStatus;
  connected: boolean;
  expiresAt: string | null;
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

export interface CreateConnectSessionOptions extends ExternalUserOptions {
  allowedServices: string[];
  allowedOrigin: string;
  expiresInSeconds?: number;
}
