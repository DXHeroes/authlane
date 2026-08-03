import { date, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';

/**
 * Daily count of API-key requests per organization.
 *
 * Aggregated rather than logged per request: the dashboard only ever asks "how much did this
 * workspace use", and a row per call would grow without bound to answer a question nobody asks at
 * that resolution. Audited access to credentials is recorded separately, in credential_access_logs,
 * which is the record that has to survive per event.
 */
export const apiUsageDaily = pgTable(
  'api_usage_daily',
  {
    organizationId: text('organization_id')
      .references(() => organization.id, { onDelete: 'cascade' })
      .notNull(),
    day: date('day').notNull(),
    requests: integer('requests').default(0).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.day] })]
);

export type ApiUsageDaily = typeof apiUsageDaily.$inferSelect;
export type NewApiUsageDaily = typeof apiUsageDaily.$inferInsert;
