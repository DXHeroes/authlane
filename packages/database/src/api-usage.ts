import { and, eq, gte, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { apiUsageDaily } from './schema/api-usage.js';

/** `YYYY-MM-DD` in UTC, the granularity the table stores. */
export function usageDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Adds requests to one organization's counter for one day.
 *
 * Callers batch: this runs once per organization per flush, not once per request, so the daily row
 * is not a lock contended by every call in flight.
 */
export async function addApiUsage(
  db: Database,
  organizationId: string,
  day: string,
  requests: number
): Promise<void> {
  if (requests <= 0) return;

  await db
    .insert(apiUsageDaily)
    .values({ organizationId, day, requests })
    .onConflictDoUpdate({
      target: [apiUsageDaily.organizationId, apiUsageDaily.day],
      set: {
        requests: sql`${apiUsageDaily.requests} + ${requests}`,
        updatedAt: new Date(),
      },
    });
}

/** Total requests an organization made on or after `sinceDay`. */
export async function countApiUsageSince(
  db: Database,
  organizationId: string,
  sinceDay: string
): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${apiUsageDaily.requests}), 0)::int` })
    .from(apiUsageDaily)
    .where(and(eq(apiUsageDaily.organizationId, organizationId), gte(apiUsageDaily.day, sinceDay)));

  return row?.total ?? 0;
}
