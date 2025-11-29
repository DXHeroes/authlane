/**
 * Services resource
 * Manages available services for connection
 */

import { parseErrorResponse } from '../errors.js';
import type { Result, Service } from '../types.js';

export class ServicesResource {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private fetchFn: typeof fetch,
    private timeout: number
  ) {}

  /**
   * List all available services
   * @returns Result with array of services
   */
  async list(): Promise<Result<Service[]>> {
    try {
      const url = `${this.baseUrl}/api/v1/services`;

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

  /**
   * Get a specific service by ID
   * @param serviceId - Service identifier (e.g., "github", "slack")
   * @returns Result with service object
   */
  async get(serviceId: string): Promise<Result<Service>> {
    try {
      const url = `${this.baseUrl}/api/v1/services/${encodeURIComponent(serviceId)}`;

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
