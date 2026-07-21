import { publicToolDefinitionsByService } from '@authlane/integration-contracts';
import type { OAuth2Credentials, ToolHandler } from '@authlane/shared';

const graphOrigin = 'https://graph.microsoft.com';
const graphBaseUrl = `${graphOrigin}/v1.0`;
const maximumFileBytes = 4 * 1024 * 1024;

function requiredString(params: Record<string, unknown>, name: string): string {
  const value = params[name];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Invalid ${name}`);
  return value;
}

function optionalString(params: Record<string, unknown>, name: string): string | undefined {
  const value = params[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Invalid ${name}`);
  return value;
}

function requiredStringArray(params: Record<string, unknown>, name: string): string[] {
  const value = params[name];
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
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
  if (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > 8_192) {
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
  if (!url.startsWith(`${graphBaseUrl}/`) && url !== `${graphBaseUrl}/sites`) {
    throw new Error('Invalid Microsoft Graph endpoint');
  }
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${credentials.access_token}`,
      Accept: 'application/json',
      ...(typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`Microsoft Graph request failed (${response.status})`);
  if (response.status === 202 || response.status === 204) return { success: true };
  const text = await response.text();
  return text.length === 0 ? { success: true } : withCursor(JSON.parse(text) as unknown);
}

function itemPath(params: Record<string, unknown>): string {
  return `/drives/${encodeURIComponent(requiredString(params, 'drive_id'))}/items/${encodeURIComponent(requiredString(params, 'item_id'))}`;
}

async function downloadFile(
  params: Record<string, unknown>,
  credentials: OAuth2Credentials
): Promise<unknown> {
  const response = await fetch(`${graphBaseUrl}${itemPath(params)}/content`, {
    headers: { Authorization: `Bearer ${credentials.access_token}` },
  });
  if (!response.ok) throw new Error(`Microsoft Graph request failed (${response.status})`);
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > maximumFileBytes) throw new Error('Microsoft file exceeds 4 MiB limit');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumFileBytes) throw new Error('Microsoft file exceeds 4 MiB limit');
  return {
    contentBase64: Buffer.from(bytes).toString('base64'),
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    size: bytes.byteLength,
  };
}

async function execute(
  toolName: string,
  params: Record<string, unknown>,
  credentials: OAuth2Credentials
): Promise<unknown> {
  if (toolName === 'microsoft_sharepoint_search_sites') {
    return graphRequest(
      `/sites?${new URLSearchParams({ search: requiredString(params, 'query') })}`,
      credentials
    );
  }
  if (toolName === 'microsoft_sharepoint_get_site') {
    return graphRequest(
      `/sites/${encodeURIComponent(requiredString(params, 'site_id'))}`,
      credentials
    );
  }
  if (toolName === 'microsoft_sharepoint_list_drives') {
    return graphRequest(
      `/sites/${encodeURIComponent(requiredString(params, 'site_id'))}/drives`,
      credentials
    );
  }
  if (toolName === 'microsoft_sharepoint_get_drive') {
    return graphRequest(
      `/drives/${encodeURIComponent(requiredString(params, 'drive_id'))}`,
      credentials
    );
  }
  if (toolName === 'microsoft_sharepoint_list_items') {
    const driveId = encodeURIComponent(requiredString(params, 'drive_id'));
    const parentId = encodeURIComponent(optionalString(params, 'parent_item_id') ?? 'root');
    const path = `/drives/${driveId}/items/${parentId}/children`;
    const cursor = decodeCursor(params.cursor, path);
    return graphRequest(
      cursor ?? `${path}?${new URLSearchParams({ $top: String(positiveLimit(params)) })}`,
      credentials
    );
  }
  if (toolName === 'microsoft_sharepoint_get_item')
    return graphRequest(itemPath(params), credentials);
  if (toolName === 'microsoft_sharepoint_download_file') return downloadFile(params, credentials);
  if (toolName === 'microsoft_sharepoint_list_permissions') {
    return graphRequest(`${itemPath(params)}/permissions`, credentials);
  }
  if (toolName === 'microsoft_sharepoint_create_folder') {
    const driveId = encodeURIComponent(requiredString(params, 'drive_id'));
    const parentId = encodeURIComponent(optionalString(params, 'parent_item_id') ?? 'root');
    const conflictBehavior = optionalString(params, 'conflict_behavior') ?? 'fail';
    if (!['fail', 'rename', 'replace'].includes(conflictBehavior)) {
      throw new Error('Invalid conflict_behavior');
    }
    return graphRequest(`/drives/${driveId}/items/${parentId}/children`, credentials, {
      method: 'POST',
      body: JSON.stringify({
        name: requiredString(params, 'folder_name'),
        folder: {},
        '@microsoft.graph.conflictBehavior': conflictBehavior,
      }),
    });
  }
  if (toolName === 'microsoft_sharepoint_upload_file') {
    const content = Buffer.from(requiredString(params, 'content_base64'), 'base64');
    if (content.byteLength === 0 || content.byteLength > maximumFileBytes) {
      throw new Error('Microsoft file must be between 1 byte and 4 MiB');
    }
    const driveId = encodeURIComponent(requiredString(params, 'drive_id'));
    const parentId = encodeURIComponent(optionalString(params, 'parent_item_id') ?? 'root');
    const fileName = encodeURIComponent(requiredString(params, 'file_name'));
    return graphRequest(`/drives/${driveId}/items/${parentId}:/${fileName}:/content`, credentials, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(content),
    });
  }
  if (toolName === 'microsoft_sharepoint_update_item') {
    return graphRequest(itemPath(params), credentials, {
      method: 'PATCH',
      body: JSON.stringify({ name: requiredString(params, 'name') }),
    });
  }
  if (toolName === 'microsoft_sharepoint_move_item') {
    return graphRequest(itemPath(params), credentials, {
      method: 'PATCH',
      body: JSON.stringify({
        parentReference: { id: requiredString(params, 'destination_parent_item_id') },
        ...(typeof params.name === 'string' ? { name: params.name } : {}),
      }),
    });
  }
  if (toolName === 'microsoft_sharepoint_copy_item') {
    return graphRequest(`${itemPath(params)}/copy`, credentials, {
      method: 'POST',
      body: JSON.stringify({
        parentReference: { id: requiredString(params, 'destination_parent_item_id') },
        ...(typeof params.name === 'string' ? { name: params.name } : {}),
      }),
    });
  }
  if (toolName === 'microsoft_sharepoint_create_sharing_link') {
    const type = requiredString(params, 'link_type');
    const scope = requiredString(params, 'scope');
    if (
      !['view', 'edit'].includes(type) ||
      !['anonymous', 'organization', 'users'].includes(scope)
    ) {
      throw new Error('Invalid sharing link options');
    }
    return graphRequest(`${itemPath(params)}/createLink`, credentials, {
      method: 'POST',
      body: JSON.stringify({ type, scope }),
    });
  }
  if (toolName === 'microsoft_sharepoint_invite_users') {
    const roles = requiredStringArray(params, 'roles');
    if (roles.some((role) => role !== 'read' && role !== 'write')) throw new Error('Invalid roles');
    return graphRequest(`${itemPath(params)}/invite`, credentials, {
      method: 'POST',
      body: JSON.stringify({
        recipients: requiredStringArray(params, 'recipients').map((email) => ({ email })),
        roles,
        message: typeof params.message === 'string' ? params.message : '',
        requireSignIn: params.require_sign_in !== false,
        sendInvitation: params.send_invitation !== false,
      }),
    });
  }
  if (toolName === 'microsoft_sharepoint_delete_item') {
    return graphRequest(itemPath(params), credentials, { method: 'DELETE' });
  }
  if (toolName === 'microsoft_sharepoint_delete_permission') {
    return graphRequest(
      `${itemPath(params)}/permissions/${encodeURIComponent(requiredString(params, 'permission_id'))}`,
      credentials,
      { method: 'DELETE' }
    );
  }
  throw new Error('Unsupported Microsoft SharePoint tool');
}

export const tools: Record<string, ToolHandler> = Object.fromEntries(
  publicToolDefinitionsByService['microsoft-sharepoint'].map((definition) => [
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
