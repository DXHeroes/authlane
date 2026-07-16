/**
 * Job queue setup
 * Configures BullMQ for token refresh jobs
 */

import type { Database } from '@authlane/database';
import { refreshToken, type TokenRefreshData } from '@authlane/database';
import { Queue, Worker } from 'bullmq';
import { markExpiredConnections, processOutboxBatch } from './outbox.js';

let tokenRefreshQueue: Queue<TokenRefreshData> | null = null;
let tokenRefreshWorker: Worker<TokenRefreshData> | null = null;
let outboxQueue: Queue<Record<string, never>> | null = null;
let outboxWorker: Worker<Record<string, never>> | null = null;
let redisConnectionFailed = false;

/**
 * Suppress repeated Redis errors - only log once
 */
function handleRedisError(_err: Error) {
  if (!redisConnectionFailed) {
    redisConnectionFailed = true;
    console.log('⚠️  Redis connection failed. Token refresh jobs disabled.');
    console.log('💡 To enable: Start Redis with `docker run -d -p 6379:6379 redis`');
    console.log('💡 Or comment out REDIS_URL in .env to disable this feature');
  }
}

/**
 * Sets up the token refresh queue and worker
 */
export function setupJobs(db: Database, redisUrl?: string) {
  if (!redisUrl) {
    console.log('⚠️  Redis not configured, token refresh jobs disabled');
    return;
  }

  // In development, skip Redis setup entirely if REDIS_OPTIONAL is set
  // This prevents error spam when Redis isn't running
  if (process.env.NODE_ENV !== 'production' && process.env.REDIS_OPTIONAL === 'true') {
    console.log('⚠️  REDIS_OPTIONAL=true, skipping Redis setup');
    return;
  }

  try {
    const redisHost = new URL(redisUrl).hostname;
    const redisPort = parseInt(new URL(redisUrl).port || '6379', 10);

    // Common Redis connection options with error handling
    const connectionOptions = {
      host: redisHost,
      port: redisPort,
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
          throw new Error(result.error || 'Token refresh failed');
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
      console.log(`✅ Token refresh completed for connection ${job.data.connectionId}`);
    });

    tokenRefreshWorker.on('failed', (job, err) => {
      console.error(
        `❌ Token refresh failed for connection ${job?.data.connectionId}:`,
        err.message
      );
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

    console.log('✅ Token refresh queue and worker initialized');
  } catch (error) {
    console.log('⚠️  Failed to setup Redis jobs:', error instanceof Error ? error.message : error);
    console.log('💡 Token refresh jobs disabled. App will continue without background jobs.');
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
      jobId: `token-refresh-${connectionId}`,
      removeOnComplete: true,
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
