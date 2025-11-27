/**
 * Job queue setup
 * Configures BullMQ for token refresh jobs
 */

import type { Database } from '@authlane/database';
import { refreshToken, type TokenRefreshData } from '@authlane/database';
import { Queue, Worker } from 'bullmq';

let tokenRefreshQueue: Queue<TokenRefreshData> | null = null;
let tokenRefreshWorker: Worker<TokenRefreshData> | null = null;

/**
 * Sets up the token refresh queue and worker
 */
export function setupJobs(db: Database, redisUrl?: string) {
  if (!redisUrl) {
    console.log('⚠️  Redis not configured, token refresh jobs disabled');
    return;
  }

  // Create queue
  tokenRefreshQueue = new Queue<TokenRefreshData>('token-refresh', {
    connection: {
      host: new URL(redisUrl).hostname,
      port: parseInt(new URL(redisUrl).port || '6379', 10),
    },
  });

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
      connection: {
        host: new URL(redisUrl).hostname,
        port: parseInt(new URL(redisUrl).port || '6379', 10),
      },
    }
  );

  tokenRefreshWorker.on('completed', (job) => {
    console.log(`✅ Token refresh completed for connection ${job.data.connectionId}`);
  });

  tokenRefreshWorker.on('failed', (job, err) => {
    console.error(`❌ Token refresh failed for connection ${job?.data.connectionId}:`, err.message);
  });

  console.log('✅ Token refresh queue and worker initialized');
}

/**
 * Schedules a token refresh job
 */
export async function scheduleTokenRefresh(
  connectionId: string,
  tenantId: string,
  serviceId: string,
  expiresAt: Date | null
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
      tenantId,
      serviceId,
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
  if (tokenRefreshWorker) {
    await tokenRefreshWorker.close();
    tokenRefreshWorker = null;
  }
  if (tokenRefreshQueue) {
    await tokenRefreshQueue.close();
    tokenRefreshQueue = null;
  }
}
