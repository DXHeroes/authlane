/**
 * Registers Authlane as an OAuth client at a tenant MCP server (RFC 7591).
 *
 * Without this the OAuth 2.1 half of tenant MCP servers cannot work at all: `resolveMcpAuthorization`
 * refuses to start an authorization redirect until `mcp_servers.oauth_client_id` holds a value, and
 * nothing else in the codebase ever writes that column. Every OAuth2 server therefore reported
 * "not ready" no matter how well its discovery went.
 *
 * Dynamic registration is what makes a catalogue of servers practical. A provider that supports it
 * needs no application registered by hand and no platform credential, so adding a server costs one
 * row in a list rather than an operations task.
 */

import type { Database, SecretStore } from '@authlane/database';
import { saveMcpOAuthClient } from '@authlane/database';
import { isSameRegistrableDomain } from '@authlane/shared';
import type { McpDiscoveryDeps } from './mcp-discovery-run.js';
import { oauthCallbackUrl } from './public-api-base.js';

/** What a server returned when it accepted the registration. */
export interface RegisteredOAuthClient {
  clientId: string;
  /** Absent for a public client, which is legitimate: the flow is PKCE either way. */
  clientSecret: string | null;
}

export type ClientRegistrationResult =
  | { ok: true; client: RegisteredOAuthClient }
  | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The callback the server must redirect back to.
 *
 * The same URI `issueAuthorizationRedirect` builds at authorize time, because it is now literally
 * the same call. The comment here used to claim they were derived the same way while both were
 * spelled out separately; if they ever disagreed the provider would reject the redirect and the
 * failure would surface at the provider with nothing on our side to explain it.
 */
export function mcpCallbackUrl(apiBaseUrl: string, serverId: string): string {
  return oauthCallbackUrl(apiBaseUrl, serverId);
}

export async function registerMcpOAuthClient(
  serverId: string,
  registrationEndpoint: string,
  options: { host: string; apiBaseUrl: string; deps: McpDiscoveryDeps }
): Promise<ClientRegistrationResult> {
  // Discovery already refuses a metadata document whose registration endpoint sits outside the
  // registered domain. Checked again here because this function sends a request of its own, and a
  // caller reaching it by another route must not be able to skip that.
  if (!isSameRegistrableDomain(options.host, registrationEndpoint)) {
    return { ok: false, message: 'The registration endpoint is outside the server domain' };
  }

  const redirectUri = mcpCallbackUrl(options.apiBaseUrl, serverId);

  let payload: unknown;
  try {
    payload = await options.deps.fetchJson(registrationEndpoint, {
      method: 'POST',
      body: JSON.stringify({
        client_name: 'Authlane',
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        // Ask for a confidential client. A server that only issues public clients answers without a
        // secret, which PKCE already covers.
        token_endpoint_auth_method: 'client_secret_post',
      }),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error';
    return { ok: false, message: `Client registration was refused: ${detail}` };
  }

  if (!isRecord(payload) || typeof payload.client_id !== 'string' || !payload.client_id) {
    return { ok: false, message: 'Client registration returned no client_id' };
  }

  return {
    ok: true,
    client: {
      clientId: payload.client_id,
      clientSecret: typeof payload.client_secret === 'string' ? payload.client_secret : null,
    },
  };
}

/**
 * Registers an OAuth client for a server that has not got one yet, and stores it.
 *
 * Shared by the registration route and the scheduled refresh so both behave the same. Returns the
 * reason it did nothing rather than throwing: a server whose tools were discovered is still useful
 * even when registration fails, and taking its tool list away over that would be the wrong trade.
 */
export async function ensureMcpOAuthClient(
  db: Database,
  secretStore: SecretStore,
  input: {
    serverId: string;
    organizationId: string;
    host: string;
    authType: string;
    registrationEndpoint: string | null;
    existingClientId: string | null;
    apiBaseUrl: string | null;
    deps: McpDiscoveryDeps;
  }
): Promise<{ registered: boolean; message?: string }> {
  if (input.authType !== 'oauth2') return { registered: false };
  if (!input.registrationEndpoint) {
    return { registered: false, message: 'The server does not offer dynamic client registration' };
  }
  // Already registered. Registering again would abandon the previous client in the provider's
  // account on every refresh.
  if (input.existingClientId) return { registered: false };
  if (!input.apiBaseUrl) {
    // A guessed redirect_uri would be accepted here and rejected at authorize time, which is a far
    // worse failure than not registering.
    return { registered: false, message: 'APP_URL is not configured, so no redirect URI is known' };
  }

  const result = await registerMcpOAuthClient(input.serverId, input.registrationEndpoint, {
    host: input.host,
    apiBaseUrl: input.apiBaseUrl,
    deps: input.deps,
  });
  if (!result.ok) return { registered: false, message: result.message };

  let clientSecretId: string | null = null;
  if (result.client.clientSecret) {
    const plaintext = Buffer.from(result.client.clientSecret, 'utf8');
    try {
      clientSecretId = await secretStore.put({
        organizationId: input.organizationId,
        purpose: 'oauth_client_secret',
        plaintext,
      });
    } finally {
      // The secret never outlives this block in plaintext.
      plaintext.fill(0);
    }
  }

  await saveMcpOAuthClient(db, input.serverId, {
    clientId: result.client.clientId,
    clientSecretId,
    source: 'dynamic',
  });
  return { registered: true };
}
