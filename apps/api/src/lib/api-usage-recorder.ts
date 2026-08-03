/**
 * Counts API-key requests per organization.
 *
 * Every call increments an in-memory counter; a timer writes the accumulated totals. Writing on
 * each request would make one row per organization per day the lock that every request in flight
 * queues behind, to answer a question the dashboard asks once. The cost of buffering is that a
 * crash loses at most one interval's counts, which is the right trade for a usage figure and the
 * wrong one for an audit record — those are written per event, synchronously, elsewhere.
 */

import { addApiUsage, type Database, usageDay, withTenantContext } from '@authlane/database';
import { logger } from './logger.js';

const FLUSH_INTERVAL_MS = 10_000;

export interface ApiUsageRecorder {
  record(organizationId: string, at?: Date): void;
  flush(): Promise<void>;
  stop(): Promise<void>;
}

export function createApiUsageRecorder(
  db: Database,
  flushIntervalMs = FLUSH_INTERVAL_MS
): ApiUsageRecorder {
  // Keyed by organization and day, so a flush that straddles midnight still lands on the right row.
  const pending = new Map<string, { organizationId: string; day: string; requests: number }>();

  async function flush(): Promise<void> {
    if (pending.size === 0) return;

    const batch = [...pending.values()];
    pending.clear();

    for (const entry of batch) {
      try {
        // Row-level security applies to this table, so the write runs in the owning tenant's
        // context exactly as a request would.
        await withTenantContext(db, entry.organizationId, () =>
          addApiUsage(db, entry.organizationId, entry.day, entry.requests)
        );
      } catch (error) {
        // A lost count must never fail a request or stop the loop. Report it and move on.
        logger.warn(
          { error, organizationId: entry.organizationId, requests: entry.requests },
          'Failed to record API usage'
        );
      }
    }
  }

  const timer = setInterval(() => {
    void flush();
  }, flushIntervalMs);
  // The counter must not be the reason the process stays alive.
  timer.unref?.();

  return {
    record(organizationId, at = new Date()) {
      const day = usageDay(at);
      const key = `${organizationId}:${day}`;
      const entry = pending.get(key);
      if (entry) {
        entry.requests += 1;
        return;
      }
      pending.set(key, { organizationId, day, requests: 1 });
    },
    flush,
    async stop() {
      clearInterval(timer);
      await flush();
    },
  };
}
