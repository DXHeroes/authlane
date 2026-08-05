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

/** How a request wants the stored client secret to change. */
export type McpOAuthClientSecretChange =
  | { kind: 'set'; value: string }
  | { kind: 'public' }
  | { kind: 'unchanged' };

export interface McpOAuthClientInput {
  clientId: string;
  secret: McpOAuthClientSecretChange;
}

const MAX_CLIENT_ID_LENGTH = 255;
const MAX_CLIENT_SECRET_LENGTH = 4096;

/**
 * Validates an OAuth client a tenant registered with a provider themselves.
 *
 * Only the client id and secret are accepted. The authorization and token endpoints stay whatever
 * discovery read from the server and checked against its host — letting a tenant type those would
 * hand them a way around every check the discovery module exists to make.
 *
 * Both values are trimmed, because a credential pasted from a provider console routinely carries a
 * trailing newline, and the failure mode of keeping it is a 401 at token exchange hours later with
 * nothing on screen to explain it.
 */
export function parseMcpOAuthClientInput(body: unknown): McpOAuthClientInput | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;

  if (typeof record.clientId !== 'string') return null;
  const clientId = record.clientId.trim();
  if (!clientId || clientId.length > MAX_CLIENT_ID_LENGTH) return null;
  // The id is sent as a query parameter and as a form field, so encoding handles the rest. This
  // rejects a value carrying whitespace or a control character, which would otherwise travel
  // mangled and fail at the provider with nothing to point at.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point.
  if (/[\s\u0000-\u001f\u007f]/.test(clientId)) return null;

  if (record.clientSecret === undefined) return { clientId, secret: { kind: 'unchanged' } };
  if (record.clientSecret === null) return { clientId, secret: { kind: 'public' } };
  if (typeof record.clientSecret !== 'string') return null;

  const clientSecret = record.clientSecret.trim();
  if (!clientSecret || clientSecret.length > MAX_CLIENT_SECRET_LENGTH) return null;

  return { clientId, secret: { kind: 'set', value: clientSecret } };
}
