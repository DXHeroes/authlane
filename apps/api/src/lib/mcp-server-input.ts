import { parseServerUrl } from '@authlane/shared';

export interface McpServerRegistration {
  name: string;
  serverUrl: string;
  authType: 'oauth2' | 'api_key';
}

const MAX_NAME_LENGTH = 120;

/**
 * Validates what a workspace owner submits when registering a server.
 *
 * The URL is normalised here rather than at the database, so `server_url` never stores a value
 * Authlane would refuse to dial later.
 */
export function parseMcpServerRegistration(body: unknown): McpServerRegistration | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;

  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name || name.length > MAX_NAME_LENGTH) return null;

  const authType = record.authType;
  if (authType !== 'oauth2' && authType !== 'api_key') return null;

  if (typeof record.serverUrl !== 'string') return null;
  const parsed = parseServerUrl(record.serverUrl);
  if (!parsed) return null;

  return { name, serverUrl: parsed.url, authType };
}

export interface McpToolUpdate {
  risk?: 'read' | 'write' | 'destructive';
  approved?: boolean;
}

/** Validates a tenant's judgement on one discovered tool. */
export function parseMcpToolUpdate(body: unknown): McpToolUpdate | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;

  const update: McpToolUpdate = {};
  if (record.risk !== undefined) {
    if (record.risk !== 'read' && record.risk !== 'write' && record.risk !== 'destructive') {
      return null;
    }
    update.risk = record.risk;
  }
  if (record.approved !== undefined) {
    if (typeof record.approved !== 'boolean') return null;
    update.approved = record.approved;
  }

  return Object.keys(update).length > 0 ? update : null;
}
