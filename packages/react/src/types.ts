/**
 * Type definitions for @authlane/react
 */

import type { Connection, Service } from '@authlane/sdk';

/**
 * Configuration for AuthlaneProvider
 */
export interface AuthlaneConfig {
  /** Public API key for Authlane */
  publicKey: string;
  /** Base URL for Authlane API (optional, defaults to https://api.authlane.com) */
  baseUrl?: string;
  /** User ID for the current user */
  userId: string;
  /** Custom fetch implementation (optional) */
  fetch?: typeof fetch;
}

/**
 * Connection status
 */
export type ConnectionStatus = 'connected' | 'disconnected' | 'expired' | 'error';

/**
 * OAuth flow mode
 */
export type OAuthMode = 'popup' | 'redirect';

/**
 * Connection button props
 */
export interface ConnectionButtonProps {
  /** Service ID (e.g., 'github', 'slack') */
  service: string;
  /** OAuth flow mode (popup or redirect) */
  mode?: OAuthMode;
  /** Callback on successful connection */
  onSuccess?: (connection: Connection) => void;
  /** Callback on connection error */
  onError?: (error: Error) => void;
  /** Custom class name */
  className?: string;
  /** Custom button text */
  children?: React.ReactNode;
  /** Redirect URL for OAuth callback (used in redirect mode) */
  redirectUrl?: string;
  /** Additional OAuth scopes */
  scopes?: string[];
  /** Disabled state */
  disabled?: boolean;
}

/**
 * Connection list props
 */
export interface ConnectionListProps {
  /** Callback when user disconnects a service */
  onDisconnect?: (serviceId: string) => void;
  /** Custom class name */
  className?: string;
  /** Show only specific services */
  services?: string[];
  /** Enable/disable disconnect button */
  allowDisconnect?: boolean;
  /** Custom empty state */
  emptyState?: React.ReactNode;
}

/**
 * Connection item state
 */
export interface ConnectionItemState {
  connection: Connection;
  service?: Service;
  status: ConnectionStatus;
  isRefreshing: boolean;
  error?: Error;
}

/**
 * OAuth window options
 */
export interface OAuthWindowOptions {
  width?: number;
  height?: number;
  top?: number;
  left?: number;
}

/**
 * OAuth callback data
 */
export interface OAuthCallbackData {
  userId: string;
  serviceId: string;
  success: boolean;
  error?: string;
  connection?: Connection;
}
