import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  apiKeys,
  connections,
  connectSessions,
  credentialAccessLogs,
  outboxEvents,
} from '../src/schema/index.js';

function columnNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).columns.map((column) => column.name);
}

function indexNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).indexes.map((index) => index.config.name);
}

describe('SaaS-only schema contract', () => {
  it('owns each connection by organization, external user, and service', () => {
    const columns = columnNames(connections);

    expect(columns).toEqual(
      expect.arrayContaining([
        'organization_id',
        'external_user_id',
        'service_id',
        'credentials_enc',
        'expires_at',
        'updated_at',
      ])
    );
    expect(columns).not.toContain('scope');
    expect(columns).not.toContain('user_id');
    expect(indexNames(connections)).toEqual(
      expect.arrayContaining([
        'connections_org_external_user_service_unique',
        'connections_org_external_user_idx',
        'connections_status_expires_at_idx',
      ])
    );
  });

  it('stores API key scopes and supports organization-scoped revocation lookup', () => {
    expect(columnNames(apiKeys)).toEqual(
      expect.arrayContaining(['organization_id', 'key_hash', 'scopes', 'enabled', 'expires_at'])
    );
    expect(indexNames(apiKeys)).toContain('api_keys_organization_enabled_idx');
  });

  it('persists short-lived connect sessions without storing raw tokens', () => {
    expect(columnNames(connectSessions)).toEqual(
      expect.arrayContaining([
        'organization_id',
        'external_user_id',
        'token_hash',
        'allowed_services',
        'allowed_origin',
        'expires_at',
      ])
    );
    expect(columnNames(connectSessions)).not.toContain('token');
  });

  it('audits credential access and persists webhook work in an outbox', () => {
    expect(columnNames(credentialAccessLogs)).toEqual(
      expect.arrayContaining(['organization_id', 'external_user_id', 'service_id', 'api_key_id'])
    );
    expect(columnNames(outboxEvents)).toEqual(
      expect.arrayContaining(['organization_id', 'event_type', 'payload', 'status', 'attempts'])
    );
  });
});
