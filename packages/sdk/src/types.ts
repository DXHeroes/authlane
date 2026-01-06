/**
 * TypeScript types for Authlane SDK
 */

/**
 * Supabase-style result type
 * All SDK methods return { data, error } tuples
 */
export type Result<T, E = AuthlaneError> = { data: T; error: null } | { data: null; error: E };

/**
 * Authlane error with helpful debugging information
 */
export interface AuthlaneError {
  message: string;
  code: string;
  hint?: string;
  docUrl?: string;
  statusCode?: number;
}

/**
 * SDK configuration options
 */
export interface AuthlaneConfig {
  /**
   * API key for authentication (required)
   */
  apiKey: string;

  /**
   * Base URL for Authlane API
   * @default 'https://api.authlane.com'
   */
  baseUrl?: string;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * Custom fetch implementation (for testing)
   */
  fetch?: typeof fetch;
}

/**
 * Connection status
 */
export type ConnectionStatus = 'pending' | 'connected' | 'expired' | 'error';

/**
 * Connection object
 */
export interface Connection {
  id: string;
  tenantId: string;
  externalUserId: string;
  serviceId: string;
  status: ConnectionStatus;
  metadata: Record<string, unknown>;
  connectedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/**
 * OAuth2 credentials
 */
export interface OAuth2Credentials {
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  token_type?: string;
  scope?: string;
}

/**
 * API key credentials
 */
export interface ApiKeyCredentials {
  api_key: string;
  api_secret?: string;
}

/**
 * Generic credentials
 */
export type Credentials = OAuth2Credentials | ApiKeyCredentials;

/**
 * Service object
 */
export interface Service {
  id: string;
  name: string;
  authType: string;
  config: Record<string, unknown>;
  enabled: boolean;
}

/**
 * Connection health status
 */
export interface ConnectionHealth {
  status: 'healthy' | 'unhealthy';
  connection_status: ConnectionStatus;
  last_verified: string | null;
  expires_at: string | null;
}

/**
 * Tool format for AI agents
 */
export type ToolFormat = 'mcp' | 'openai';

/**
 * MCP tool definition
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * OpenAI function definition
 */
export interface OpenAIFunction {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Tools response for MCP format
 */
export interface MCPToolsResponse {
  tools: MCPTool[];
}

/**
 * Tools response for OpenAI format
 */
export interface OpenAIToolsResponse {
  functions: OpenAIFunction[];
}

/**
 * Tools response (either format)
 */
export type ToolsResponse = MCPToolsResponse | OpenAIToolsResponse;

/**
 * Request options for connections methods
 */
export interface ConnectionsListOptions {
  userId: string;
}

export interface ConnectionsGetOptions {
  userId: string;
  serviceId: string;
}

export interface ConnectionsGetCredentialsOptions {
  userId: string;
  serviceId: string;
}

export interface ConnectionsHealthOptions {
  userId: string;
  serviceId: string;
}

export interface ConnectionsDeleteOptions {
  userId: string;
  serviceId: string;
}

/**
 * Request options for tools methods
 */
export interface ToolsListOptions {
  userId: string;
  format?: ToolFormat;
}

/**
 * Delete connection response
 */
export interface DeleteConnectionResponse {
  message: string;
  service: string;
}
