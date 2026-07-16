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
  sentry: {
    authorization: ['https://sentry.io/oauth/authorize/'],
    token: ['https://sentry.io/oauth/token/'],
  },
  slack: {
    authorization: ['https://slack.com/oauth/v2/authorize'],
    token: ['https://slack.com/api/oauth.v2.access'],
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
    authorization: ['https://app.hubspot.com/oauth/authorize'],
    token: ['https://api.hubapi.com/oauth/v1/token'],
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
};

const MAX_TOKEN_RESPONSE_BYTES = 64 * 1024;

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
  if (!OAUTH_ENDPOINTS[serviceId]?.[kind].includes(normalized)) {
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
  fetchImpl: (input: string, init: RequestInit) => Promise<Response> = fetch
): Promise<{ response: Response; body: Record<string, unknown> }> {
  const endpoint = validateOAuthEndpoint(serviceId, 'token', tokenUrl);
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  return { response, body: await readLimitedJson(response) };
}
