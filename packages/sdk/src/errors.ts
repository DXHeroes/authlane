/**
 * Error handling utilities for Authlane SDK
 */

import type { AuthlaneError } from './types.js';

/**
 * Creates an Authlane error object
 */
export function createError(
  message: string,
  code: string,
  options?: {
    hint?: string;
    docUrl?: string;
    statusCode?: number;
  }
): AuthlaneError {
  return {
    message,
    code,
    hint: options?.hint,
    docUrl: options?.docUrl,
    statusCode: options?.statusCode,
  };
}

/**
 * Error codes used by the SDK
 */
export const ErrorCodes = {
  // Configuration errors
  INVALID_CONFIG: 'INVALID_CONFIG',
  MISSING_API_KEY: 'MISSING_API_KEY',

  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',

  // API errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  // Response errors
  INVALID_RESPONSE: 'INVALID_RESPONSE',
} as const;

/**
 * Common error creators
 */
export const Errors = {
  missingApiKey: (): AuthlaneError =>
    createError('API key is required', ErrorCodes.MISSING_API_KEY, {
      hint: 'Provide an API key in the Authlane constructor',
      docUrl: 'https://docs.authlane.dev/sdk/typescript',
    }),

  networkError: (message: string): AuthlaneError =>
    createError(`Network error: ${message}`, ErrorCodes.NETWORK_ERROR, {
      hint: 'Check your internet connection and the base URL',
      docUrl: 'https://docs.authlane.dev/sdk/typescript',
    }),

  timeoutError: (): AuthlaneError =>
    createError('Request timeout', ErrorCodes.TIMEOUT_ERROR, {
      hint: 'Increase the timeout or check your network connection',
      docUrl: 'https://docs.authlane.dev/sdk/typescript',
    }),

  validationError: (message: string): AuthlaneError =>
    createError(message, ErrorCodes.VALIDATION_ERROR),

  invalidResponse: (message: string): AuthlaneError =>
    createError(`Invalid response: ${message}`, ErrorCodes.INVALID_RESPONSE, {
      hint: 'This may indicate a version mismatch or API issue',
      docUrl: 'https://docs.authlane.dev/support',
    }),
};

/**
 * Parses an error response from the API
 */
export function parseErrorResponse(response: {
  message?: string;
  code?: string;
  hint?: string;
  docUrl?: string;
  statusCode?: number;
}): AuthlaneError {
  return {
    message: response.message || 'Unknown error',
    code: response.code || 'UNKNOWN_ERROR',
    hint: response.hint,
    docUrl: response.docUrl,
    statusCode: response.statusCode,
  };
}
