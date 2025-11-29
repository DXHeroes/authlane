/**
 * Authlane SDK Client
 * Main entry point for the Authlane TypeScript SDK
 */

import { Errors } from './errors.js';
import { ConnectionsResource } from './resources/connections.js';
import { ServicesResource } from './resources/services.js';
import { ToolsResource } from './resources/tools.js';
import type { AuthlaneConfig } from './types.js';

/**
 * Authlane client for interacting with the Authlane API
 *
 * @example
 * ```typescript
 * const authlane = new Authlane({
 *   apiKey: process.env.AUTHLANE_API_KEY,
 * });
 *
 * // List connections for a user
 * const { data, error } = await authlane.connections.list({
 *   userId: 'user_123',
 * });
 *
 * if (error) {
 *   console.error(error.message, error.code);
 * } else {
 *   console.log(data);
 * }
 * ```
 */
export class Authlane {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;
  private fetchFn: typeof fetch;

  /**
   * Connections resource - manage user connections to services
   */
  public readonly connections: ConnectionsResource;

  /**
   * Services resource - manage available services
   */
  public readonly services: ServicesResource;

  /**
   * Tools resource - get AI agent tools for connected services
   */
  public readonly tools: ToolsResource;

  /**
   * Create a new Authlane client
   *
   * @param config - Configuration options
   * @throws {Error} If API key is missing
   */
  constructor(config: AuthlaneConfig) {
    // Validate configuration
    if (!config.apiKey) {
      const error = Errors.missingApiKey();
      throw new Error(`${error.message} (${error.code})`);
    }

    // Set configuration
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.authlane.com';
    this.timeout = config.timeout || 30000;
    this.fetchFn = config.fetch || fetch;

    // Initialize resources
    this.connections = new ConnectionsResource(
      this.baseUrl,
      this.apiKey,
      this.fetchFn,
      this.timeout
    );

    this.services = new ServicesResource(this.baseUrl, this.apiKey, this.fetchFn, this.timeout);

    this.tools = new ToolsResource(this.baseUrl, this.apiKey, this.fetchFn, this.timeout);
  }
}
