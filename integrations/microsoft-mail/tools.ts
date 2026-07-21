import { publicToolDefinitionsByService } from '@authlane/integration-contracts';
import type { OAuth2Credentials, ToolHandler } from '@authlane/shared';

const graphOrigin = 'https://graph.microsoft.com';
const graphBaseUrl = `${graphOrigin}/v1.0`;
const maximumCursorLength = 8_192;

function requiredString(params: Record<string, unknown>, name: string): string {
  const value = params[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}

function optionalString(params: Record<string, unknown>, name: string): string | undefined {
  const value = params[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Invalid ${name}`);
  return value;
}

function stringArray(params: Record<string, unknown>, name: string, required = false): string[] {
  const value = params[name];
  if (value === undefined && !required) return [];
  if (
    !Array.isArray(value) ||
    (required && value.length === 0) ||
    value.length > 100 ||
    value.some((entry) => typeof entry !== 'string' || entry.length === 0)
  ) {
    throw new Error(`Invalid ${name}`);
  }
  return value as string[];
}

function positiveLimit(params: Record<string, unknown>): number {
  const value = params.limit ?? 25;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 100) {
    throw new Error('Invalid limit');
  }
  return Number(value);
}

function decodeCursor(cursor: unknown, expectedPath: string): string | undefined {
  if (cursor === undefined) return undefined;
  if (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > maximumCursorLength) {
    throw new Error('Invalid cursor');
  }
  let url: URL;
  try {
    url = new URL(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid cursor');
  }
  if (url.origin !== graphOrigin || url.pathname !== `/v1.0${expectedPath}`) {
    throw new Error('Invalid cursor');
  }
  return url.toString();
}

function withCursor(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const object = { ...(data as Record<string, unknown>) };
  const nextLink = object['@odata.nextLink'];
  delete object['@odata.nextLink'];
  if (typeof nextLink === 'string') object.nextCursor = Buffer.from(nextLink).toString('base64url');
  return object;
}

async function graphRequest(
  endpoint: string,
  credentials: OAuth2Credentials,
  options: RequestInit = {}
): Promise<unknown> {
  const url = endpoint.startsWith('https://') ? endpoint : `${graphBaseUrl}${endpoint}`;
  if (!url.startsWith(`${graphBaseUrl}/`)) throw new Error('Invalid Microsoft Graph endpoint');
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${credentials.access_token}`,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`Microsoft Graph request failed (${response.status})`);
  if (response.status === 202 || response.status === 204) return { success: true };
  const text = await response.text();
  return text.length === 0 ? { success: true } : withCursor(JSON.parse(text) as unknown);
}

function recipients(addresses: string[]) {
  return addresses.map((address) => ({ emailAddress: { address } }));
}

function messageBody(params: Record<string, unknown>) {
  return {
    subject: requiredString(params, 'subject'),
    body: {
      contentType: params.body_type === 'html' ? 'HTML' : 'Text',
      content: requiredString(params, 'body'),
    },
    toRecipients: recipients(stringArray(params, 'to', true)),
    ...(params.cc === undefined ? {} : { ccRecipients: recipients(stringArray(params, 'cc')) }),
    ...(params.bcc === undefined ? {} : { bccRecipients: recipients(stringArray(params, 'bcc')) }),
  };
}

async function execute(
  toolName: string,
  params: Record<string, unknown>,
  credentials: OAuth2Credentials
): Promise<unknown> {
  if (toolName === 'microsoft_mail_list_messages') {
    const folderId = optionalString(params, 'folder_id') ?? 'inbox';
    const path = `/me/mailFolders/${encodeURIComponent(folderId)}/messages`;
    const cursor = decodeCursor(params.cursor, path);
    if (cursor) return graphRequest(cursor, credentials);
    const query = new URLSearchParams({ $top: String(positiveLimit(params)) });
    return graphRequest(`${path}?${query}`, credentials);
  }
  if (toolName === 'microsoft_mail_search_messages') {
    const folderId = optionalString(params, 'folder_id');
    const path = folderId
      ? `/me/mailFolders/${encodeURIComponent(folderId)}/messages`
      : '/me/messages';
    const cursor = decodeCursor(params.cursor, path);
    if (cursor) return graphRequest(cursor, credentials);
    const query = new URLSearchParams({
      $search: `"${requiredString(params, 'query').replaceAll('"', '\\"')}"`,
      $top: String(positiveLimit(params)),
    });
    return graphRequest(`${path}?${query}`, credentials);
  }
  if (toolName === 'microsoft_mail_get_message') {
    return graphRequest(
      `/me/messages/${encodeURIComponent(requiredString(params, 'message_id'))}`,
      credentials
    );
  }
  if (toolName === 'microsoft_mail_list_folders') {
    const parentId = optionalString(params, 'parent_folder_id');
    const path = parentId
      ? `/me/mailFolders/${encodeURIComponent(parentId)}/childFolders`
      : '/me/mailFolders';
    const cursor = decodeCursor(params.cursor, path);
    if (cursor) return graphRequest(cursor, credentials);
    return graphRequest(
      `${path}?${new URLSearchParams({ $top: String(positiveLimit(params)) })}`,
      credentials
    );
  }
  if (toolName === 'microsoft_mail_list_attachments') {
    return graphRequest(
      `/me/messages/${encodeURIComponent(requiredString(params, 'message_id'))}/attachments`,
      credentials
    );
  }
  if (toolName === 'microsoft_mail_get_attachment') {
    return graphRequest(
      `/me/messages/${encodeURIComponent(requiredString(params, 'message_id'))}/attachments/${encodeURIComponent(requiredString(params, 'attachment_id'))}`,
      credentials
    );
  }
  if (toolName === 'microsoft_mail_create_draft') {
    return graphRequest('/me/messages', credentials, {
      method: 'POST',
      body: JSON.stringify(messageBody(params)),
    });
  }
  if (toolName === 'microsoft_mail_update_message') {
    const body: Record<string, unknown> = {};
    if (typeof params.is_read === 'boolean') body.isRead = params.is_read;
    if (params.categories !== undefined) body.categories = stringArray(params, 'categories');
    if (typeof params.subject === 'string') body.subject = params.subject;
    if (typeof params.body === 'string') {
      body.body = {
        contentType: params.body_type === 'html' ? 'HTML' : 'Text',
        content: params.body,
      };
    }
    if (Object.keys(body).length === 0) throw new Error('At least one update field is required');
    return graphRequest(
      `/me/messages/${encodeURIComponent(requiredString(params, 'message_id'))}`,
      credentials,
      { method: 'PATCH', body: JSON.stringify(body) }
    );
  }
  if (toolName === 'microsoft_mail_send_message') {
    return graphRequest('/me/sendMail', credentials, {
      method: 'POST',
      body: JSON.stringify({ message: messageBody(params), saveToSentItems: true }),
    });
  }
  if (toolName === 'microsoft_mail_send_draft') {
    return graphRequest(
      `/me/messages/${encodeURIComponent(requiredString(params, 'message_id'))}/send`,
      credentials,
      { method: 'POST', body: JSON.stringify({}) }
    );
  }
  if (toolName === 'microsoft_mail_reply_to_message') {
    return graphRequest(
      `/me/messages/${encodeURIComponent(requiredString(params, 'message_id'))}/reply`,
      credentials,
      { method: 'POST', body: JSON.stringify({ comment: requiredString(params, 'comment') }) }
    );
  }
  if (toolName === 'microsoft_mail_forward_message') {
    return graphRequest(
      `/me/messages/${encodeURIComponent(requiredString(params, 'message_id'))}/forward`,
      credentials,
      {
        method: 'POST',
        body: JSON.stringify({
          comment: typeof params.comment === 'string' ? params.comment : '',
          toRecipients: recipients(stringArray(params, 'to', true)),
        }),
      }
    );
  }
  if (toolName === 'microsoft_mail_move_message') {
    return graphRequest(
      `/me/messages/${encodeURIComponent(requiredString(params, 'message_id'))}/move`,
      credentials,
      {
        method: 'POST',
        body: JSON.stringify({ destinationId: requiredString(params, 'destination_folder_id') }),
      }
    );
  }
  if (toolName === 'microsoft_mail_delete_message') {
    return graphRequest(
      `/me/messages/${encodeURIComponent(requiredString(params, 'message_id'))}`,
      credentials,
      { method: 'DELETE' }
    );
  }
  throw new Error('Unsupported Microsoft Mail tool');
}

export const tools: Record<string, ToolHandler> = Object.fromEntries(
  publicToolDefinitionsByService['microsoft-mail'].map((definition) => [
    definition.name,
    {
      definition: {
        name: definition.name,
        description: definition.description,
        annotations: definition.annotations,
        inputSchema: definition.inputSchema as ToolHandler['definition']['inputSchema'],
      },
      handler: (params: Record<string, unknown>, credentials: OAuth2Credentials) =>
        execute(definition.name, params, credentials),
    },
  ])
);
