/**
 * Job queue setup
 * Configures BullMQ for token refresh jobs
 */

import type { Database, SecretStore } from '@authlane/database';
import { createDatabaseSecretStore, refreshToken, type TokenRefreshData } from '@authlane/database';
import {
  type JobSchedulerTemplateOptions,
  Queue,
  type RepeatOptions,
  UnrecoverableError,
  Worker,
} from 'bullmq';
import type { CacheStore } from '../lib/cache.js';
import { logger } from '../lib/logger.js';
import { createMcpDiscoveryDeps } from '../lib/mcp-discovery-deps.js';
import { rediscoverStaleMcpServers } from './mcp-discovery.js';
import { markExpiredConnections, processOutboxBatch } from './outbox.js';
import { discoverProviderTools } from './provider-tool-discovery.js';

let tokenRefreshQueue: Queue<TokenRefreshData> | null = null;
let tokenRefreshWorker: Worker<TokenRefreshData> | null = null;
let outboxQueue: Queue<Record<string, never>> | null = null;
let outboxWorker: Worker<Record<string, never>> | null = null;
let mcpDiscoveryQueue: Queue<Record<string, never>> | null = null;
let mcpDiscoveryWorker: Worker<Record<string, never>> | null = null;
let providerToolsQueue: Queue<Record<string, never>> | null = null;
let providerToolsWorker: Worker<Record<string, never>> | null = null;
let redisConnectionFailed = false;

interface JobSchedule {
  id: string;
  repeat: Omit<RepeatOptions, 'key'>;
  template: { opts: JobSchedulerTemplateOptions };
}

/**
 * BullMQ 6 removed `repeat` from job options; a recurring job is now a named scheduler that owns
 * its own template. The scheduler id replaces the fixed jobId that used to deduplicate the repeat.
 */
export const outboxSweepSchedule = {
  id: 'webhook-outbox-sweep',
  repeat: { every: 1_000 },
  template: { opts: { removeOnComplete: true, removeOnFail: 100 } },
} satisfies JobSchedule;

/**
 * Hourly, against a contract that may be a day old.
 *
 * The sweep only picks up servers past that age, so the interval decides how promptly a stale
 * contract is noticed, not how often a server is contacted.
 */
export const mcpDiscoverySweepSchedule = {
  id: 'mcp-discovery-sweep',
  repeat: { every: 60 * 60 * 1_000 },
  template: { opts: { removeOnComplete: true, removeOnFail: 20 } },
} satisfies JobSchedule;

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
/**
 * Twice a day, against a catalogue that may be twelve hours old.
 *
 * Each run costs one request to each provider per organization, so the interval trades promptness
 * for politeness towards someone else's API.
 */
export const providerToolsSweepSchedule = {
  id: 'provider-tools-sweep',
  repeat: { every: 12 * 60 * 60 * 1_000 },
  template: { opts: { removeOnComplete: true, removeOnFail: 20 } },
} satisfies JobSchedule;

export function setupJobs(
  db: Database,
  redisUrl?: string,
  cache?: CacheStore,
  secretStore: SecretStore = createDatabaseSecretStore(db)
) {
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
    outboxWorker.on('failed', (_job, err) => {
      // pino serializes an Error to its type alone, which told me a sweep was failing without
      // saying why. The message and stack are the whole point of the report.
      logger.error({ error: err?.message, stack: err?.stack }, 'Webhook outbox sweep failed');
    });
    void outboxQueue
      .upsertJobScheduler(outboxSweepSchedule.id, outboxSweepSchedule.repeat, {
        name: 'sweep',
        ...outboxSweepSchedule.template,
      })
      .catch(handleRedisError);

    const discoveryDeps = createMcpDiscoveryDeps();
    mcpDiscoveryQueue = new Queue<Record<string, never>>('mcp-discovery', {
      connection: connectionOptions,
    });
    mcpDiscoveryWorker = new Worker<Record<string, never>>(
      'mcp-discovery',
      () => rediscoverStaleMcpServers(db, discoveryDeps, { cache }),
      { connection: connectionOptions }
    );
    mcpDiscoveryQueue.on('error', handleRedisError);
    mcpDiscoveryWorker.on('error', handleRedisError);
    mcpDiscoveryWorker.on('failed', (_job, err) => {
      // pino serializes an Error to its type alone, which told me a sweep was failing without
      // saying why. The message and stack are the whole point of the report.
      logger.error({ error: err?.message, stack: err?.stack }, 'Tenant MCP discovery sweep failed');
    });
    void mcpDiscoveryQueue
      .upsertJobScheduler(mcpDiscoverySweepSchedule.id, mcpDiscoverySweepSchedule.repeat, {
        name: 'sweep',
        ...mcpDiscoverySweepSchedule.template,
      })
      .catch(handleRedisError);

    providerToolsQueue = new Queue<Record<string, never>>('provider-tools', {
      connection: connectionOptions,
    });
    providerToolsWorker = new Worker<Record<string, never>>(
      'provider-tools',
      () => discoverProviderTools(db, secretStore, { cache }),
      { connection: connectionOptions }
    );
    providerToolsQueue.on('error', handleRedisError);
    providerToolsWorker.on('error', handleRedisError);
    providerToolsWorker.on('failed', (_job, err) => {
      // pino serializes an Error to its type alone, which told me a sweep was failing without
      // saying why. The message and stack are the whole point of the report.
      logger.error(
        { error: err?.message, stack: err?.stack },
        'Provider MCP tool discovery sweep failed'
      );
    });
    // Reported even when it found nothing: silence used to be indistinguishable from a sweep that
    // threw on every run, which is what sent me looking through logs for an answer that was not
    // there.
    providerToolsWorker.on('completed', (_job, result) => {
      logger.info({ result }, 'Provider MCP tool discovery sweep completed');
    });
    void providerToolsQueue
      .upsertJobScheduler(providerToolsSweepSchedule.id, providerToolsSweepSchedule.repeat, {
        name: 'sweep',
        ...providerToolsSweepSchedule.template,
      })
      .catch(handleRedisError);
    // A scheduler's first run is one interval away, which would leave a fresh deployment offering
    // only the static contracts for twelve hours. This asks once at boot instead. The sweep's own
    // staleness filter makes it nearly free: a catalogue checked recently is skipped, so repeated
    // deploys do not repeatedly call someone else's API.
    // No fixed job id. `removeOnFail` retains a failed job and BullMQ deduplicates by id, so a
    // fixed one meant the first failure silenced every boot after it — which is exactly what
    // happened: the sweep never ran again after its first permission error and the queue looked
    // idle. Deploys are rare and the sweep filters by staleness, so an extra enqueue costs nothing.
    void providerToolsQueue
      .add('sweep', {}, providerToolsSweepSchedule.template.opts)
      .catch(handleRedisError);

    logger.info(
      'Token refresh, webhook outbox, MCP discovery and provider tool workers initialized'
    );
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
  if (providerToolsWorker) {
    await providerToolsWorker.close();
    providerToolsWorker = null;
  }
  if (providerToolsQueue) {
    await providerToolsQueue.close();
    providerToolsQueue = null;
  }
  if (mcpDiscoveryWorker) {
    await mcpDiscoveryWorker.close();
    mcpDiscoveryWorker = null;
  }
  if (mcpDiscoveryQueue) {
    await mcpDiscoveryQueue.close();
    mcpDiscoveryQueue = null;
  }
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
