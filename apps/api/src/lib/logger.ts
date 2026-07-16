import pino from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';
const logLevel = (process.env.LOG_LEVEL || 'info') as pino.Level;

export const logger = pino({
  level: logLevel,
  redact: {
    paths: [
      'authorization',
      'cookie',
      'headers.authorization',
      'headers.cookie',
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.secret',
      '*.code',
      '*.access_token',
      '*.refresh_token',
      '*.id_token',
    ],
    censor: '[REDACTED]',
  },

  // Use pretty printing in development, JSON in production
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      }
    : undefined,

  // Production settings
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },

  // Add timestamp in production
  timestamp: () => `,"time":"${new Date().toISOString()}"`,

  // Serialize errors
  serializers: {
    error: (value: unknown) => {
      if (!(value instanceof Error)) return { type: 'UnknownError' };
      const code = (value as Error & { code?: unknown }).code;
      return {
        type: value.name,
        ...(typeof code === 'string' || typeof code === 'number' ? { code } : {}),
      };
    },
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },

  // Base fields
  base: {
    env: process.env.NODE_ENV,
    service: 'authlane-api',
  },
});

// Helper functions for structured logging
export function logInfo(message: string, context?: Record<string, unknown>) {
  logger.info(context, message);
}

export function logError(message: string, error?: Error, context?: Record<string, unknown>) {
  logger.error({ ...context, error }, message);
}

export function logWarn(message: string, context?: Record<string, unknown>) {
  logger.warn(context, message);
}

export function logDebug(message: string, context?: Record<string, unknown>) {
  logger.debug(context, message);
}

// Request logging
export function logRequest(
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  context?: Record<string, unknown>
) {
  logger.info(
    {
      ...context,
      method,
      path,
      statusCode,
      duration,
      type: 'request',
    },
    `${method} ${path} ${statusCode} ${duration}ms`
  );
}

// Database query logging
export function logQuery(_query: string, duration: number, context?: Record<string, unknown>) {
  logger.debug(
    {
      ...context,
      duration,
      type: 'database',
    },
    `Query executed in ${duration}ms`
  );
}

// OAuth flow logging
export function logOAuth(provider: string, action: string, context?: Record<string, unknown>) {
  logger.info(
    {
      ...context,
      provider,
      action,
      type: 'oauth',
    },
    `OAuth ${action} for ${provider}`
  );
}

export default logger;
