import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';

export const secretRecords = pgTable(
  'secret_records',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    keyId: text('key_id').notNull(),
    wrappedDek: text('wrapped_dek').notNull(),
    wrappedDekIv: text('wrapped_dek_iv').notNull(),
    wrappedDekTag: text('wrapped_dek_tag').notNull(),
    ciphertext: text('ciphertext').notNull(),
    payloadIv: text('payload_iv').notNull(),
    payloadTag: text('payload_tag').notNull(),
    aadVersion: integer('aad_version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('secret_records_org_purpose_idx').on(table.organizationId, table.purpose),
    index('secret_records_key_id_idx').on(table.keyId),
  ]
);

export type SecretRecord = typeof secretRecords.$inferSelect;
export type NewSecretRecord = typeof secretRecords.$inferInsert;
