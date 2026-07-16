/**
 * Job queue setup
 * Configures BullMQ for token refresh jobs
 */

import type { Database } from '@authlane/database';
import { refreshToken, type TokenRefreshData } from '@authlane/database';
import { Queue, UnrecoverableError, Worker } from 'bullmq';
import { logger } from '../lib/logger.js';
import { markExpiredConnections, processOutboxBatch } from './outbox.js';

let tokenRefreshQueue: Queue<TokenRefreshData> | null = null;
let tokenRefreshWorker: Worker<TokenRefreshData> | null = null;
let outboxQueue: Queue<Record<string, never>> | null = null;
let outboxWorker: Worker<Record<string, never>> | null = null;
let redisConnectionFailed = false;

export function bullMqConnectionOptions(redisUrl: string) {
  const url = new URL(redisUrl);
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error('BullMQ requires a redis:// or rediss:// URL');
  }
  const database = url.pathname === '/' ? 0 : Number(url.pathname.slice(1));
  if (!Number.isInteger(database) || database < 0) {
    throw new Error('Redis URL contains an invalid database number');
  }
  return {
    host: url.hostname,
    port: Number(url.port || (url.protocol === 'rediss:' ? 6380 : 6379)),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: database,
    tls: url.protocol === 'rediss:' ? {} : undefined,
  };
}

/**
 * Suppress repeated Redis errors - only log once
 */
function handleRedisError(_err: Error) {
  if (!redisConnectionFailed) {
    redisConnectionFailed = true;
    logger.error({ error: _err }, 'Redis connection failed; background jobs are unavailable');
  }
}

/**
 * Sets up the token refresh queue and worker
 */
export function setupJobs(db: Database, redisUrl?: string) {
  if (!redisUrl) {
    logger.warn('Redis is not configured; background jobs are disabled');
    return;
  }

  // In development, skip Redis setup entirely if REDIS_OPTIONAL is set
  // This prevents error spam when Redis isn't running
  if (process.env.NODE_ENV !== 'production' && process.env.REDIS_OPTIONAL === 'true') {
    logger.warn('REDIS_OPTIONAL is enabled; background jobs are disabled');
    return;
  }

  try {
    const parsedConnection = bullMqConnectionOptions(redisUrl);

    // Common Redis connection options with error handling
    const connectionOptions = {
      ...parsedConnection,
      maxRetriesPerRequest: null as null, // Required by BullMQ
      retryStrategy: (times: number) => {
        handleRedisError(new Error('Connection failed'));
        // Stop retrying in development
        if (process.env.NODE_ENV !== 'production') {
          return null; // Stop retrying
        }
        // In production, retry with exponential backoff (max 30 seconds)
        return Math.min(times * 1000, 30000);
      },
      enableOfflineQueue: false, // Don't queue commands when disconnected
      lazyConnect: true, // Don't connect immediately
    };

    // Create queue
    tokenRefreshQueue = new Queue<TokenRefreshData>('token-refresh', {
      connection: connectionOptions,
    });

    // Handle queue errors silently after first message
    tokenRefreshQueue.on('error', handleRedisError);

    // Create worker
    tokenRefreshWorker = new Worker<TokenRefreshData>(
      'token-refresh',
      async (job) => {
        const result = await refreshToken(db, job.data);
        if (!result.success) {
          if (!result.retryable) {
            throw new UnrecoverableError(result.error || 'Token refresh permanently failed');
          }
          throw new Error(result.error || 'Token refresh failed');
        }
        if (result.expiresAt) {
          await scheduleTokenRefresh(
            job.data.connectionId,
            job.data.serviceId,
            job.data.organizationId,
            new Date(result.expiresAt)
          );
        }
        return result;
      },
      {
        connection: connectionOptions,
      }
    );

    // Handle worker errors silently after first message
    tokenRefreshWorker.on('error', handleRedisError);

    tokenRefreshWorker.on('completed', (job) => {
      logger.info({ connectionId: job.data.connectionId }, 'Token refresh completed');
    });

    tokenRefreshWorker.on('failed', (job, err) => {
      logger.error({ connectionId: job?.data.connectionId, error: err }, 'Token refresh failed');
    });

    outboxQueue = new Queue<Record<string, never>>('webhook-outbox', {
      connection: connectionOptions,
    });
    outboxWorker = new Worker<Record<string, never>>(
      'webhook-outbox',
      async () => {
        await markExpiredConnections(db);
        return processOutboxBatch(db);
      },
      { connection: connectionOptions }
    );
    outboxQueue.on('error', handleRedisError);
    outboxWorker.on('error', handleRedisError);
    void outboxQueue
      .add('sweep', {}, { repeat: { every: 1_000 }, jobId: 'webhook-outbox-sweep' })
      .catch(handleRedisError);

    logger.info('Token refresh and webhook outbox workers initialized');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize background jobs');
    if (process.env.NODE_ENV === 'production') throw error;
  }
}

/**
 * Schedules a token refresh job
 */
export async function scheduleTokenRefresh(
  connectionId: string,
  serviceId: string,
  organizationId: string,
  expiresAt?: Date | null
): Promise<void> {
  if (!tokenRefreshQueue) {
    return; // Redis not configured
  }

  if (!expiresAt) {
    return; // No expiration, no need to refresh
  }

  // Schedule refresh 5 minutes before expiration
  const refreshAt = new Date(expiresAt.getTime() - 5 * 60 * 1000);
  const delay = Math.max(0, refreshAt.getTime() - Date.now());

  await tokenRefreshQueue.add(
    'refresh',
    {
      connectionId,
      serviceId,
      organizationId,
    },
    {
      delay,
      jobId: `token-refresh-${connectionId}-${expiresAt.getTime()}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: 100,
    }
  );
}

/**
 * Closes job queues and workers
 */
export async function closeJobs(): Promise<void> {
  if (outboxWorker) {
    await outboxWorker.close();
    outboxWorker = null;
  }
  if (outboxQueue) {
    await outboxQueue.close();
    outboxQueue = null;
  }
  if (tokenRefreshWorker) {
    await tokenRefreshWorker.close();
    tokenRefreshWorker = null;
  }
  if (tokenRefreshQueue) {
    await tokenRefreshQueue.close();
    tokenRefreshQueue = null;
  }
}
