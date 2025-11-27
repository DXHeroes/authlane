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
export type ConnectionStatus = 'pending' | 'connected' | 'expired' | 'error';

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
