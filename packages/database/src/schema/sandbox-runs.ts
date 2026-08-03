import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';

export const sandboxRuns = pgTable(
  'sandbox_runs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id').notNull(),
    externalUserId: text('external_user_id').notNull(),
    mode: text('mode', { enum: ['tool', 'agent'] }).notNull(),
    provider: text('provider'),
    model: text('model'),
    serviceId: text('service_id'),
    toolName: text('tool_name'),
    risk: text('risk', { enum: ['read', 'write', 'destructive'] }),
    status: text('status', { enum: ['succeeded', 'failed', 'approval_required'] }).notNull(),
    durationMs: integer('duration_ms').notNull(),
    errorCode: text('error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('sandbox_runs_org_created_at_idx').on(table.organizationId, table.createdAt),
    index('sandbox_runs_org_external_user_idx').on(table.organizationId, table.externalUserId),
  ]
);

export type SandboxRun = typeof sandboxRuns.$inferSelect;
export type NewSandboxRun = typeof sandboxRuns.$inferInsert;
