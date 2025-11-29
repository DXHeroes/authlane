/**
 * Authlane client wrapper for MCP server
 * This file provides a simple interface to the Authlane API
 */

import type { ToolFormat } from './types.js';

export interface AuthlaneConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface ToolsListOptions {
  userId: string;
  format?: ToolFormat;
}

export interface ToolsResponse {
  tools?: unknown[];
  functions?: unknown[];
}

export interface Result<T> {
  data: T | null;
  error: {
    message: string;
    code: string;
    hint?: string;
  } | null;
}

export interface AuthlaneClient {
  tools: {
    list: (options: ToolsListOptions) => Promise<Result<ToolsResponse>>;
  };
}

/**
 * Create an Authlane client
 * This is a simplified version that doesn't depend on @authlane/sdk
 * to avoid circular dependencies during development
 */
export function createAuthlaneClient(config: AuthlaneConfig): AuthlaneClient {
  const baseUrl = config.baseUrl || 'https://api.authlane.com';
  const apiKey = config.apiKey;

  return {
    tools: {
      async list(options: ToolsListOptions): Promise<Result<ToolsResponse>> {
        try {
          const { userId, format = 'mcp' } = options;
          const url = `${baseUrl}/api/v1/users/${encodeURIComponent(userId)}/tools?format=${format}`;

          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'x-api-key': apiKey,
              'Content-Type': 'application/json',
            },
          });

          const json = (await response.json()) as any;

          if (!response.ok) {
            return {
              data: null,
              error: {
                message: json.error?.message || 'Request failed',
                code: json.error?.code || 'UNKNOWN_ERROR',
                hint: json.error?.hint,
              },
            };
          }

          return {
            data: json.data,
            error: null,
          };
        } catch (error) {
          return {
            data: null,
            error: {
              message: error instanceof Error ? error.message : 'Unknown error occurred',
              code: error instanceof Error && error.name === 'AbortError' ? 'TIMEOUT_ERROR' : 'NETWORK_ERROR',
            },
          };
        }
      },
    },
  };
}
