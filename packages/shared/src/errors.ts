import type { AuthlaneError } from './types.js';

/**
 * Creates an Authlane error
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
 * Common error codes
 */
export const ErrorCodes = {
  // Authentication errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_API_KEY: 'INVALID_API_KEY',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INSUFFICIENT_SCOPE: 'INSUFFICIENT_SCOPE',
  CSRF_FAILED: 'CSRF_FAILED',
  MFA_ENROLLMENT_REQUIRED: 'MFA_ENROLLMENT_REQUIRED',
  STEP_UP_REQUIRED: 'STEP_UP_REQUIRED',

  // Not found errors
  NOT_FOUND: 'NOT_FOUND',
  TENANT_NOT_FOUND: 'TENANT_NOT_FOUND',
  SERVICE_NOT_FOUND: 'SERVICE_NOT_FOUND',
  CONNECTION_NOT_FOUND: 'CONNECTION_NOT_FOUND',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_USER_ID: 'INVALID_USER_ID',
  INVALID_SERVICE_ID: 'INVALID_SERVICE_ID',

  // OAuth errors
  OAUTH_ERROR: 'OAUTH_ERROR',
  OAUTH_STATE_MISMATCH: 'OAUTH_STATE_MISMATCH',
  OAUTH_TOKEN_EXCHANGE_FAILED: 'OAUTH_TOKEN_EXCHANGE_FAILED',
  OAUTH_REFRESH_FAILED: 'OAUTH_REFRESH_FAILED',

  // Connection errors
  CONNECTION_EXPIRED: 'CONNECTION_EXPIRED',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  CONNECTION_NOT_CONNECTED: 'CONNECTION_NOT_CONNECTED',

  // Internal errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  ENCRYPTION_ERROR: 'ENCRYPTION_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
} as const;

/**
 * Common error creators
 */
export const Errors = {
  unauthorized: (hint?: string): AuthlaneError =>
    createError('Unauthorized', ErrorCodes.UNAUTHORIZED, {
      hint: hint || 'Check your API key',
      statusCode: 401,
      docUrl: 'https://docs.authlane.dev/authentication',
    }),

  insufficientScope: (hint?: string): AuthlaneError =>
    createError('Forbidden', ErrorCodes.INSUFFICIENT_SCOPE, {
      hint: hint || 'Use credentials with the required authorization scope',
      statusCode: 403,
      docUrl: 'https://docs.authlane.dev/authentication',
    }),

  csrfFailed: (): AuthlaneError =>
    createError('Forbidden', ErrorCodes.CSRF_FAILED, {
      hint: 'Retry the request from the authenticated Authlane origin',
      statusCode: 403,
      docUrl: 'https://docs.authlane.dev/guides/security',
    }),

  mfaEnrollmentRequired: (): AuthlaneError =>
    createError(
      'Multi-factor authentication enrollment is required',
      ErrorCodes.MFA_ENROLLMENT_REQUIRED,
      {
        hint: 'Enroll a TOTP authenticator before changing security-sensitive settings',
        statusCode: 403,
        docUrl: 'https://docs.authlane.dev/guides/security',
      }
    ),

  stepUpRequired: (): AuthlaneError =>
    createError('Fresh authentication is required', ErrorCodes.STEP_UP_REQUIRED, {
      hint: 'Sign in again, complete MFA, and retry the operation',
      statusCode: 403,
      docUrl: 'https://docs.authlane.dev/guides/security',
    }),

  notFound: (resource: string, id?: string): AuthlaneError =>
    createError(`${resource} not found${id ? `: ${id}` : ''}`, ErrorCodes.NOT_FOUND, {
      statusCode: 404,
      docUrl: 'https://docs.authlane.dev/api-reference',
    }),

  validationError: (message: string, hint?: string): AuthlaneError =>
    createError(`Validation error: ${message}`, ErrorCodes.VALIDATION_ERROR, {
      hint,
      statusCode: 400,
      docUrl: 'https://docs.authlane.dev/api-reference',
    }),

  oauthError: (message: string, hint?: string): AuthlaneError =>
    createError(`OAuth error: ${message}`, ErrorCodes.OAUTH_ERROR, {
      hint,
      statusCode: 400,
      docUrl: 'https://docs.authlane.dev/guides/oauth-setup',
    }),

  oauthStateMismatch: (message: string): AuthlaneError =>
    createError(`OAuth state mismatch: ${message}`, ErrorCodes.OAUTH_STATE_MISMATCH, {
      hint: 'The OAuth state parameter does not match. This may indicate a security issue.',
      statusCode: 400,
      docUrl: 'https://docs.authlane.dev/guides/oauth-setup',
    }),

  oauthTokenExchangeFailed: (message: string): AuthlaneError =>
    createError(`OAuth token exchange failed: ${message}`, ErrorCodes.OAUTH_TOKEN_EXCHANGE_FAILED, {
      hint: 'Check your OAuth client credentials and redirect URI',
      statusCode: 400,
      docUrl: 'https://docs.authlane.dev/guides/oauth-setup',
    }),

  connectionExpired: (service: string): AuthlaneError =>
    createError(`Connection to ${service} has expired`, ErrorCodes.CONNECTION_EXPIRED, {
      hint: 'Reconnect the service to refresh credentials',
      statusCode: 401,
      docUrl: 'https://docs.authlane.dev/guides/connections',
    }),

  connectionNotConnected: (message: string): AuthlaneError =>
    createError(message, ErrorCodes.CONNECTION_NOT_CONNECTED, {
      hint: 'The connection must be in "connected" status',
      statusCode: 400,
      docUrl: 'https://docs.authlane.dev/guides/connections',
    }),

  connectionError: (message: string): AuthlaneError =>
    createError(message, ErrorCodes.CONNECTION_ERROR, {
      statusCode: 400,
      docUrl: 'https://docs.authlane.dev/guides/connections',
    }),

  encryptionError: (message: string): AuthlaneError =>
    createError(message, ErrorCodes.ENCRYPTION_ERROR, {
      statusCode: 500,
      docUrl: 'https://docs.authlane.dev/guides/security',
    }),

  internalError: (message: string): AuthlaneError =>
    createError(`Internal error: ${message}`, ErrorCodes.INTERNAL_ERROR, {
      statusCode: 500,
      docUrl: 'https://docs.authlane.dev/support',
    }),
};
