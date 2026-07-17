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
 * // Read connection status and tool definitions in one request
 * const { data, error } = await authlane.capabilities.get({
 *   externalUserId: 'user_123',
 *   format: 'mcp',
 * });
 * ```
 */

export { Authlane } from './client.js';
export * from './errors.js';
export * from './types.js';
export { UserScope } from './user-scope.js';
