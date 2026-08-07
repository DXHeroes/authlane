import type { McpServerConnectConfig } from '@authlane/database';
import { getPlatformOAuthCredentials } from '@authlane/shared';

/**
 * Why a service cannot be connected right now.
 *
 * Each one names something the workspace owner can go and fix: switch the service back on,
 * register an OAuth application, or supply an authorization endpoint. The catalogue publishes
 * these as `notConnectableReason` and the authorize route reports them when it refuses, so they
 * are declared once here rather than restated at either call site.
 */
export type NotConnectableReason =
  | 'missing_oauth_client'
  | 'missing_authorization_url'
  | 'disabled';

/**
 * Every way an authorization can fail before a redirect is minted.
 *
 * Beyond the connectability reasons there are two that say nothing about provider configuration:
 * the service is not there at all, and the service is not connected over OAuth in the first place.
 */
export type AuthorizationRefusal = NotConnectableReason | 'not_found' | 'not_oauth';

export type McpAuthorizationResolution =
  | {
      ok: true;
      authorizationEndpoint: string;
      oauthClientId: string;
      oauthClientSecretId: string | null;
    }
  | { ok: false; reason: AuthorizationRefusal };

/**
 * Decides whether a tenant MCP server can start an authorization redirect.
 *
 * The endpoint comes from the metadata stored at discovery, which was checked to be https and on
 * the registered domain. It is never re-read from the server here, so a server cannot present one
 * endpoint at discovery and another when a user connects. The https check is repeated anyway, so a
 * hand-edited row cannot slip a plaintext endpoint past this point.
 *
 * `enabled` is settled before `authType` on purpose: a server that is off cannot be connected by
 * any route, and reporting it as "not an OAuth server" would send its owner looking for the wrong
 * problem. It also lets {@link connectabilityOf} read `not_oauth` as "connectable by API key",
 * which is only true of a server that is actually on.
 */
export function resolveMcpAuthorization(
  config: McpServerConnectConfig | null
): McpAuthorizationResolution {
  if (!config) return { ok: false, reason: 'not_found' };
  if (!config.enabled) return { ok: false, reason: 'disabled' };
  if (config.authType !== 'oauth2') return { ok: false, reason: 'not_oauth' };
  if (!config.oauthClientId) return { ok: false, reason: 'missing_oauth_client' };
  if (!config.authorizationEndpoint?.startsWith('https://')) {
    return { ok: false, reason: 'missing_authorization_url' };
  }

  return {
    ok: true,
    authorizationEndpoint: config.authorizationEndpoint,
    oauthClientId: config.oauthClientId,
    oauthClientSecretId: config.oauthClientSecretId,
  };
}

/** What decides whether a built-in catalog service can start an authorization redirect. */
export interface BuiltInAuthorizationInput {
  serviceId: string;
  authType: string;
  /**
   * Whether this organization may use the service. The authorize route has already established
   * this by the time it asks; the catalogue passes the value it read from the row.
   */
  enabled: boolean;
  /** The `services.config` column, whose shape is per provider. */
  config: unknown;
  /** The organization's own OAuth application, when it registered one. */
  tenantOAuthClientId: string | null;
}

export type BuiltInAuthorizationResolution =
  | { ok: true; authorizationUrl: string; oauthClientId: string }
  | { ok: false; reason: Exclude<AuthorizationRefusal, 'not_found'> };

/**
 * Decides whether a built-in catalog service can start an authorization redirect.
 *
 * A tenant application wins over the platform-wide Authlane one, which is why the client id is
 * resolved here rather than by the caller: the catalogue would otherwise have to repeat the
 * fallback and could disagree with the route about which services have a usable application.
 *
 * The returned `authorizationUrl` is the raw value from the catalog row. Callers that are about to
 * redirect must still put it through the endpoint allowlist — this function answers whether an
 * authorization is configured, not whether the URL is one Authlane will send a user to.
 */
export function resolveBuiltInAuthorization(
  input: BuiltInAuthorizationInput
): BuiltInAuthorizationResolution {
  if (!input.enabled) return { ok: false, reason: 'disabled' };
  if (input.authType !== 'oauth2') return { ok: false, reason: 'not_oauth' };

  const config = input.config as { authorization_url?: unknown } | null | undefined;
  const authorizationUrl =
    typeof config?.authorization_url === 'string' ? config.authorization_url : '';
  if (!authorizationUrl) return { ok: false, reason: 'missing_authorization_url' };

  const oauthClientId =
    input.tenantOAuthClientId ?? getPlatformOAuthCredentials(input.serviceId)?.clientId ?? null;
  if (!oauthClientId) return { ok: false, reason: 'missing_oauth_client' };

  return { ok: true, authorizationUrl, oauthClientId };
}

/** The catalogue's public verdict on one service. */
export type ServiceConnectability =
  | { connectable: true }
  | { connectable: false; notConnectableReason: NotConnectableReason };

/**
 * Turns an authorization resolution into what the catalogue publishes.
 *
 * This is the only place a `connectable` value is produced. The catalogue never decides for itself
 * whether a service is ready — it hands the same row to the same resolver the authorize route
 * calls and translates the answer — so the list cannot drift into promising a connection the
 * authorize route would refuse.
 */
export function connectabilityOf(
  resolution: { ok: true } | { ok: false; reason: AuthorizationRefusal }
): ServiceConnectability {
  if (resolution.ok) return { connectable: true };

  switch (resolution.reason) {
    /*
     * Not an OAuth service, so no OAuth application can be missing. An API-key service is
     * connected through POST /connect/:serviceId/api-key, which asks only that the service is on —
     * and that was already settled above this point. Reporting `missing_oauth_client` here would
     * send its owner to a provider console it has no business visiting.
     */
    case 'not_oauth':
      return { connectable: true };
    /*
     * The service is gone. Nobody can connect to it and there is nothing to configure, which is
     * the same practical position as switched off.
     */
    case 'not_found':
      return { connectable: false, notConnectableReason: 'disabled' };
    default:
      return { connectable: false, notConnectableReason: resolution.reason };
  }
}
