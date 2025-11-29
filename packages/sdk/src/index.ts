/**
 * @authlane/sdk
 * TypeScript SDK for Authlane - OAuth connections for AI agents
 *
 * @example
 * ```typescript
 * import { Authlane } from '@authlane/sdk';
 *
 * const authlane = new Authlane({
 *   apiKey: process.env.AUTHLANE_API_KEY,
 * });
 *
 * // List connections for a user
 * const { data, error } = await authlane.connections.list({ userId: 'user_123' });
 * ```
 */

export { Authlane } from './client.js';
export * from './types.js';
export * from './errors.js';
