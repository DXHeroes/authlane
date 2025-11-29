/**
 * Connections resource
 * Manages end-user connections to third-party services
 */

import { parseErrorResponse } from '../errors.js';
import type {
  Connection,
  ConnectionHealth,
  ConnectionsDeleteOptions,
  ConnectionsGetCredentialsOptions,
  ConnectionsGetOptions,
  ConnectionsHealthOptions,
  ConnectionsListOptions,
  Credentials,
  DeleteConnectionResponse,
  Result,
} from '../types.js';

export class ConnectionsResource {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private fetchFn: typeof fetch,
    private timeout: number
  ) {}

  /**
   * List all connections for a user
   * @param options - Options with userId
   * @returns Result with array of connections
   */
  async list(options: ConnectionsListOptions): Promise<Result<Connection[]>> {
    try {
      const { userId } = options;
      const url = `${this.baseUrl}/api/v1/users/${encodeURIComponent(userId)}/connections`;

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
   * Get a specific connection
   * @param options - Options with userId and serviceId
   * @returns Result with connection object
   */
  async get(options: ConnectionsGetOptions): Promise<Result<Connection>> {
    try {
      const { userId, serviceId } = options;
      const url = `${this.baseUrl}/api/v1/users/${encodeURIComponent(userId)}/connections/${encodeURIComponent(serviceId)}`;

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
   * Get decrypted credentials for a connection
   * @param options - Options with userId and serviceId
   * @returns Result with credentials object
   */
  async getCredentials(options: ConnectionsGetCredentialsOptions): Promise<Result<Credentials>> {
    try {
      const { userId, serviceId } = options;
      const url = `${this.baseUrl}/api/v1/users/${encodeURIComponent(userId)}/connections/${encodeURIComponent(serviceId)}/credentials`;

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
   * Check connection health
   * @param options - Options with userId and serviceId
   * @returns Result with health status
   */
  async health(options: ConnectionsHealthOptions): Promise<Result<ConnectionHealth>> {
    try {
      const { userId, serviceId } = options;
      const url = `${this.baseUrl}/api/v1/users/${encodeURIComponent(userId)}/connections/${encodeURIComponent(serviceId)}/health`;

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
   * Delete a connection (disconnect a service)
   * @param options - Options with userId and serviceId
   * @returns Result with deletion confirmation
   */
  async delete(options: ConnectionsDeleteOptions): Promise<Result<DeleteConnectionResponse>> {
    try {
      const { userId, serviceId } = options;
      const url = `${this.baseUrl}/api/v1/users/${encodeURIComponent(userId)}/connections/${encodeURIComponent(serviceId)}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await this.fetchFn(url, {
          method: 'DELETE',
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
