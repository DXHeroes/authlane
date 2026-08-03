import type { McpServerConnectConfig } from '@authlane/database';

export type McpAuthorizationResolution =
  | {
      ok: true;
      authorizationEndpoint: string;
      oauthClientId: string;
      oauthClientSecretId: string | null;
    }
  | { ok: false; reason: 'not_found' | 'not_ready' | 'not_oauth' };

/**
 * Decides whether a tenant MCP server can start an authorization redirect.
 *
 * The endpoint comes from the metadata stored at discovery, which was checked to be https and on
 * the registered domain. It is never re-read from the server here, so a server cannot present one
 * endpoint at discovery and another when a user connects. The https check is repeated anyway, so a
 * hand-edited row cannot slip a plaintext endpoint past this point.
 */
export function resolveMcpAuthorization(
  config: McpServerConnectConfig | null
): McpAuthorizationResolution {
  if (!config) return { ok: false, reason: 'not_found' };
  if (config.authType !== 'oauth2') return { ok: false, reason: 'not_oauth' };
  if (!config.enabled) return { ok: false, reason: 'not_ready' };
  if (!config.oauthClientId) return { ok: false, reason: 'not_ready' };
  if (!config.authorizationEndpoint?.startsWith('https://')) {
    return { ok: false, reason: 'not_ready' };
  }

  return {
    ok: true,
    authorizationEndpoint: config.authorizationEndpoint,
    oauthClientId: config.oauthClientId,
    oauthClientSecretId: config.oauthClientSecretId,
  };
}
