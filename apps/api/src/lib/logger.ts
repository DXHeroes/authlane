import pino from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';
const logLevel = (process.env.LOG_LEVEL || 'info') as pino.Level;

export const logger = pino({
  level: logLevel,

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
    error: pino.stdSerializers.err,
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
export function logQuery(query: string, duration: number, context?: Record<string, unknown>) {
  logger.debug(
    {
      ...context,
      query,
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
