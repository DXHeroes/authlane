import { type McpServerConnectConfig, mcpEndpointProvenance } from '@authlane/database';
import { getPlatformOAuthCredentials, isTrustedMcpEndpoint } from '@authlane/shared';

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
/**
 * Every way an authorization can fail before a redirect is minted.
 *
 * Beyond the connectability reasons there are three that say nothing about provider configuration:
 * the service is not there at all, the service is not connected over OAuth in the first place, and
 * a stored endpoint no longer passes the rule discovery accepted it under.
 *
 * `untrusted_endpoint` is deliberately not a {@link NotConnectableReason}: those are published to
 * SDK consumers as `notConnectableReason`, and widening that vocabulary for a state only a
 * hand-edited row can reach would make every caller's exhaustive switch a breaking change.
 * {@link connectabilityOf} folds it into `missing_authorization_url`, which is what it means to
 * anybody looking at the catalogue — the stored metadata is not usable, so re-run discovery.
 */
export type AuthorizationRefusal =
  | NotConnectableReason
  | 'not_found'
  | 'not_oauth'
  | 'untrusted_endpoint';

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
 * The endpoints come from the metadata stored at discovery and are never re-read from the server
 * here, so a server cannot present one endpoint at discovery and another when a user connects. Both
 * are re-checked against the provenance discovery recorded, so a hand-edited row cannot slip an
 * endpoint past this point either.
 *
 * The token endpoint is checked here, at authorize time, even though nothing uses it until the
 * callback. That is the point: the callback applies this same rule through `fetchOAuthToken`, and
 * when only the callback checked it a workspace owner could register an application in the
 * provider's console, paste the credentials, watch their user consent, and lose the whole flow at
 * the last step to `OAUTH_TOKEN_EXCHANGE_FAILED` — a message that named nothing they could act on.
 * A manual client now either works end to end or is refused up front with a reason.
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
  if (!config.authorizationEndpoint || !config.tokenEndpoint) {
    return { ok: false, reason: 'missing_authorization_url' };
  }

  const provenance = mcpEndpointProvenance(config);
  if (
    !isTrustedMcpEndpoint(config.authorizationEndpoint, provenance) ||
    !isTrustedMcpEndpoint(config.tokenEndpoint, provenance)
  ) {
    return { ok: false, reason: 'untrusted_endpoint' };
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
    /*
     * A stored endpoint no longer passes the rule discovery accepted it under, which after a
     * rediscovery can only mean the row was edited outside Authlane. The catalogue's published
     * vocabulary stays as it is: to a caller this is the same practical position as having no
     * usable authorization URL, and the fix is the same one — re-run discovery.
     */
    case 'untrusted_endpoint':
      return { connectable: false, notConnectableReason: 'missing_authorization_url' };
    default:
      return { connectable: false, notConnectableReason: resolution.reason };
  }
}
