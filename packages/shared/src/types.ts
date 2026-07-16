/**
 * Shared types for Authlane
 */

/**
 * Result type for operations that can fail
 * Inspired by Supabase/Stripe error handling pattern
 */
export type Result<T, E = AuthlaneError> = { data: T; error: null } | { data: null; error: E };

/**
 * Authlane error type
 * Provides human-readable messages, codes, hints, and documentation links
 */
export interface AuthlaneError {
  message: string; // Human-readable error message
  code: string; // Machine-readable error code
  hint?: string; // How to fix the error
  docUrl?: string; // Link to documentation
  statusCode?: number; // HTTP status code if applicable
}

/**
 * Connection status
 */
export type ConnectionStatus = 'disconnected' | 'pending' | 'connected' | 'expired' | 'error';

/**
 * Authentication type for services
 */
export type AuthType = 'oauth2' | 'api_key' | 'header';

/**
 * Tool format for AI agents
 */
export type ToolFormat = 'mcp' | 'openai';

/**
 * OAuth2 credentials
 */
export interface OAuth2Credentials {
  access_token: string;
  refresh_token?: string;
  expires_at?: string; // ISO 8601 timestamp
  token_type?: string;
  scope?: string;
  metadata?: Record<string, unknown>;
}

/**
 * API key credentials
 */
export interface ApiKeyCredentials {
  api_key: string;
  api_secret?: string;
}

/**
 * Generic credentials (union type)
 */
export type Credentials = OAuth2Credentials | ApiKeyCredentials;

export type CredentialMaterial =
  | {
      type: 'oauth2';
      accessToken: string;
      tokenType: string;
      scopes: string[];
      expiresAt: string | null;
    }
  | {
      type: 'api_key';
      apiKey: string;
      apiSecret?: string;
    }
  | {
      type: 'header';
      headers: Record<string, string>;
    };

export interface JsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface CanonicalToolDefinition {
  name: string;
  serviceId: string;
  description: string;
  inputSchema: JsonSchema;
  annotations?: Record<string, unknown>;
}

export interface ToolHandler {
  definition: Omit<CanonicalToolDefinition, 'serviceId'>;
  handler: (params: Record<string, unknown>, credentials: OAuth2Credentials) => Promise<unknown>;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  annotations?: Record<string, unknown>;
}

export interface OpenAiToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface ServiceCapability {
  serviceId: string;
  status: ConnectionStatus;
  connected: boolean;
  expiresAt: string | null;
  tools: McpToolDefinition[] | OpenAiToolDefinition[];
}

export interface CapabilitiesResponse {
  externalUserId: string;
  version: string;
  format: ToolFormat;
  services: ServiceCapability[];
}

export interface IntegrationAdapter {
  serviceId: string;
  definitions: CanonicalToolDefinition[];
  execute(
    toolName: string,
    input: Record<string, unknown>,
    credential: CredentialMaterial
  ): Promise<Result<unknown>>;
}

/**
 * Connection metadata
 */
export interface ConnectionMetadata {
  [key: string]: unknown;
}

/**
 * Service configuration
 */
export interface ServiceConfig {
  authorization_url?: string;
  token_url?: string;
  scopes?: string[];
  [key: string]: unknown;
}
