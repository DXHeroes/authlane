/**
 * Tools resource
 * Manages AI agent tools for connected services
 */

import { parseErrorResponse } from '../errors.js';
import type { Result, ToolsListOptions, ToolsResponse } from '../types.js';

export class ToolsResource {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private fetchFn: typeof fetch,
    private timeout: number
  ) {}

  /**
   * List all tools for a user's connected services
   * @param options - Options with userId and optional format
   * @returns Result with tools in specified format
   */
  async list(options: ToolsListOptions): Promise<Result<ToolsResponse>> {
    try {
      const { userId, format = 'mcp' } = options;
      const url = `${this.baseUrl}/api/v1/users/${encodeURIComponent(userId)}/tools?format=${format}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await this.fetchFn(url, {
          method: 'GET',
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const json = (await response.json()) as any;

        if (!response.ok) {
          return {
            data: null,
            error: parseErrorResponse(json),
          };
        }

        return {
          data: json.data,
          error: null,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      if (error instanceof Error) {
        return {
          data: null,
          error: {
            message: error.message,
            code: error.name === 'AbortError' ? 'TIMEOUT_ERROR' : 'NETWORK_ERROR',
          },
        };
      }
      return {
        data: null,
        error: {
          message: 'Unknown error occurred',
          code: 'UNKNOWN_ERROR',
        },
      };
    }
  }
}
