import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  apiKeys,
  connections,
  connectSessions,
  credentialAccessLogs,
  outboxEvents,
  organizationServices,
  sandboxRuns,
  secretRecords,
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
        'credential_secret_id',
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

  it('audits sandbox metadata without persisting prompts, arguments, or provider results', () => {
    const columns = columnNames(sandboxRuns);
    expect(columns).toEqual(
      expect.arrayContaining([
        'organization_id',
        'actor_user_id',
        'external_user_id',
        'mode',
        'status',
        'duration_ms',
      ])
    );
    expect(columns).not.toEqual(
      expect.arrayContaining(['prompt', 'arguments', 'result', 'messages', 'credential'])
    );
  });

  it('stores per-record envelope fields and references secrets by id', () => {
    expect(columnNames(secretRecords)).toEqual(
      expect.arrayContaining([
        'organization_id',
        'purpose',
        'key_id',
        'wrapped_dek',
        'wrapped_dek_iv',
        'wrapped_dek_tag',
        'ciphertext',
        'payload_iv',
        'payload_tag',
        'aad_version',
      ])
    );
    expect(columnNames(secretRecords)).not.toContain('plaintext');
    expect(columnNames(connections)).toContain('credential_secret_id');
    expect(columnNames(organizationServices)).toContain('tool_access_policy');
  });
});
