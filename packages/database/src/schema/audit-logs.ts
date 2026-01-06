/**
 * Audit Logs Schema
 * Tracks tool execution history for compliance and debugging
 */

import crypto from 'node:crypto';
import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organization, user } from './auth.js';

export const auditLogs = pgTable('audit_logs', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // Who executed
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),

  // What was executed
  toolName: text('tool_name').notNull(),
  serviceId: text('service_id').notNull(),

  // Input/output (parameters are redacted to remove sensitive data)
  parametersRedacted: jsonb('parameters_redacted').$type<Record<string, unknown>>(),
  resultStatus: text('result_status', { enum: ['success', 'error'] }).notNull(),
  errorMessage: text('error_message'),

  // Metadata
  executionTimeMs: integer('execution_time_ms'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),

  // Timestamps
  executedAt: timestamp('executed_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
