import type { OAuthProviderContext } from './types.js';

const OAUTH_ENDPOINTS: Record<
  string,
  { authorization: readonly string[]; token: readonly string[] }
> = {
  github: {
    authorization: ['https://github.com/login/oauth/authorize'],
    token: ['https://github.com/login/oauth/access_token'],
  },
  linear: {
    authorization: ['https://linear.app/oauth/authorize'],
    token: ['https://api.linear.app/oauth/token'],
  },
  jira: {
    authorization: ['https://auth.atlassian.com/authorize'],
    token: ['https://auth.atlassian.com/oauth/token'],
  },
  slack: {
    authorization: [
      'https://slack.com/oauth/v2_user/authorize',
      'https://slack.com/oauth/v2/authorize',
    ],
    token: ['https://slack.com/api/oauth.v2.user.access', 'https://slack.com/api/oauth.v2.access'],
  },
  discord: {
    authorization: ['https://discord.com/api/oauth2/authorize'],
    token: ['https://discord.com/api/oauth2/token'],
  },
  gmail: {
    authorization: ['https://accounts.google.com/o/oauth2/v2/auth'],
    token: ['https://oauth2.googleapis.com/token'],
  },
  'google-drive': {
    authorization: ['https://accounts.google.com/o/oauth2/v2/auth'],
    token: ['https://oauth2.googleapis.com/token'],
  },
  'google-calendar': {
    authorization: ['https://accounts.google.com/o/oauth2/v2/auth'],
    token: ['https://oauth2.googleapis.com/token'],
  },
  notion: {
    authorization: ['https://api.notion.com/v1/oauth/authorize'],
    token: ['https://api.notion.com/v1/oauth/token'],
  },
  hubspot: {
    authorization: ['https://mcp.hubspot.com/oauth/authorize/user'],
    token: ['https://mcp.hubspot.com/oauth/v3/token'],
  },
  salesforce: {
    authorization: [
      'https://login.salesforce.com/services/oauth2/authorize',
      'https://test.salesforce.com/services/oauth2/authorize',
    ],
    token: [
      'https://login.salesforce.com/services/oauth2/token',
      'https://test.salesforce.com/services/oauth2/token',
    ],
  },
  pipedrive: {
    authorization: ['https://oauth.pipedrive.com/oauth/authorize'],
    token: ['https://oauth.pipedrive.com/oauth/token'],
  },
  stripe: {
    authorization: ['https://connect.stripe.com/oauth/authorize'],
    token: ['https://connect.stripe.com/oauth/token'],
  },
  airtable: {
    authorization: ['https://airtable.com/oauth2/v1/authorize'],
    token: ['https://airtable.com/oauth2/v1/token'],
  },
  attio: {
    authorization: ['https://app.attio.com/oidc/authorize'],
    token: ['https://app.attio.com/oidc/token'],
  },
  'microsoft-calendar': {
    authorization: ['https://login.microsoftonline.com/common/oauth2/v2.0/authorize'],
    token: ['https://login.microsoftonline.com/common/oauth2/v2.0/token'],
  },
  'microsoft-mail': {
    authorization: ['https://login.microsoftonline.com/common/oauth2/v2.0/authorize'],
    token: ['https://login.microsoftonline.com/common/oauth2/v2.0/token'],
  },
  'microsoft-sharepoint': {
    authorization: ['https://login.microsoftonline.com/common/oauth2/v2.0/authorize'],
    token: ['https://login.microsoftonline.com/common/oauth2/v2.0/token'],
  },
};

const DEMO_OAUTH_ENDPOINTS = {
  authorization: ['http://localhost:5175/demo-provider/authorize'],
  token: ['http://localhost:5175/demo-provider/token'],
} as const;

function isLocalDemoEndpointEnabled(): boolean {
  return process.env.AUTHLANE_DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';
}

const MAX_TOKEN_RESPONSE_BYTES = 64 * 1024;

const BASIC_CLIENT_AUTH_SERVICES = new Set(['airtable', 'notion', 'pipedrive']);
const JSON_TOKEN_BODY_SERVICES = new Set(['notion']);
const COMMA_SEPARATED_SCOPE_SERVICES = new Set(['linear', 'slack']);
const GOOGLE_OAUTH_SERVICES = new Set(['gmail', 'google-calendar', 'google-drive']);

export interface FetchOAuthTokenOptions {
  clientId?: string;
  clientSecret?: string;
  fetchImpl?: (input: string, init: RequestInit) => Promise<Response>;
}

const PROVIDER_CONTEXT_FIELDS: Record<
  string,
  { field: string; parentDomain: string; label: string }
> = {
  pipedrive: {
    field: 'api_domain',
    parentDomain: 'pipedrive.com',
    label: 'API domain',
  },
  salesforce: {
    field: 'instance_url',
    parentDomain: 'salesforce.com',
    label: 'instance URL',
  },
};

export function parseOAuthProviderContext(
  serviceId: string,
  tokenResponse: Record<string, unknown>,
  options: { required?: boolean } = {}
): OAuthProviderContext | undefined {
  const profile = PROVIDER_CONTEXT_FIELDS[serviceId];
  if (!profile) return undefined;
  const value = tokenResponse[profile.field];
  if (typeof value !== 'string' || value.length === 0) {
    if (options.required === false) return undefined;
    throw new Error(`OAuth provider omitted its ${profile.label}`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`OAuth provider returned an invalid ${profile.label}`);
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== '' ||
    !hostname.endsWith(`.${profile.parentDomain}`)
  ) {
    throw new Error(`OAuth provider returned an unapproved provider origin`);
  }
  return { apiBaseUrl: url.origin };
}

export function validateOAuthProviderContext(
  serviceId: string,
  value: unknown
): OAuthProviderContext | undefined {
  if (value === undefined) return undefined;
  const profile = PROVIDER_CONTEXT_FIELDS[serviceId];
  if (!profile || !value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('OAuth provider context is not supported');
  }
  const apiBaseUrl = Reflect.get(value, 'apiBaseUrl');
  return parseOAuthProviderContext(serviceId, { [profile.field]: apiBaseUrl });
}

export function normalizeOAuthScopeNames(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 1_000) return null;
  const scopes: string[] = [];
  for (const entry of value) {
    const name =
      typeof entry === 'string'
        ? entry
        : entry && typeof entry === 'object' && !Array.isArray(entry)
          ? Reflect.get(entry, 'name')
          : null;
    if (typeof name !== 'string' || name.length === 0 || name.length > 1_000) return null;
    scopes.push(name);
  }
  return scopes;
}

export function getOAuthAuthorizationParameters(
  serviceId: string,
  scopes: readonly string[]
): URLSearchParams {
  const parameters = new URLSearchParams();
  if (serviceId !== 'pipedrive' && scopes.length > 0) {
    parameters.set('scope', scopes.join(COMMA_SEPARATED_SCOPE_SERVICES.has(serviceId) ? ',' : ' '));
  }
  if (serviceId === 'jira') {
    parameters.set('audience', 'api.atlassian.com');
    parameters.set('prompt', 'consent');
  }
  if (GOOGLE_OAUTH_SERVICES.has(serviceId)) {
    parameters.set('access_type', 'offline');
    parameters.set('prompt', 'consent');
    parameters.set('include_granted_scopes', 'true');
  }
  return parameters;
}

export function validateOAuthEndpoint(
  serviceId: string,
  kind: 'authorization' | 'token',
  value: string
): string {
  let normalized: string;
  try {
    normalized = new URL(value).toString();
  } catch {
    throw new Error(`OAuth ${kind} endpoint is not a valid URL`);
  }
  const allowlist =
    serviceId === 'authlane-demo' && isLocalDemoEndpointEnabled()
      ? DEMO_OAUTH_ENDPOINTS[kind]
      : OAUTH_ENDPOINTS[serviceId]?.[kind];
  if (!allowlist?.includes(normalized)) {
    throw new Error(`OAuth ${kind} endpoint is not allowlisted for ${serviceId}`);
  }
  return normalized;
}

async function readLimitedJson(response: Response): Promise<Record<string, unknown>> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_TOKEN_RESPONSE_BYTES) {
    throw new Error('OAuth token response is too large');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('OAuth token response is empty');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_TOKEN_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('OAuth token response is too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const value = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('OAuth token response must be a JSON object');
  }
  return value as Record<string, unknown>;
}

export async function fetchOAuthToken(
  serviceId: string,
  tokenUrl: string,
  body: URLSearchParams,
  options: FetchOAuthTokenOptions = {}
): Promise<{ response: Response; body: Record<string, unknown> }> {
  const endpoint = validateOAuthEndpoint(serviceId, 'token', tokenUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const requestBody = new URLSearchParams(body);
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (BASIC_CLIENT_AUTH_SERVICES.has(serviceId)) {
    if (!options.clientId || !options.clientSecret) {
      throw new Error(`OAuth client credentials are required for ${serviceId}`);
    }
    headers.Authorization = `Basic ${Buffer.from(
      `${options.clientId}:${options.clientSecret}`,
      'utf8'
    ).toString('base64')}`;
    requestBody.delete('client_id');
    requestBody.delete('client_secret');
  }

  let serializedBody: string;
  if (JSON_TOKEN_BODY_SERVICES.has(serviceId)) {
    headers['Content-Type'] = 'application/json';
    serializedBody = JSON.stringify(Object.fromEntries(requestBody.entries()));
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    serializedBody = requestBody.toString();
  }

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers,
    body: serializedBody,
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  return { response, body: await readLimitedJson(response) };
}
