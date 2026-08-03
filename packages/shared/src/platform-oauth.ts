/**
 * Platform-wide OAuth client credentials.
 *
 * A tenant may register its own OAuth application per service. When it does not, Authlane falls
 * back to a platform-wide application supplied through the environment, so a SaaS owner can offer
 * a working connect flow without registering an application with every provider first.
 *
 * Environment variable shape, with the service id upper-cased and dashes replaced by underscores:
 *
 *   AUTHLANE_OAUTH_GITHUB_CLIENT_ID / AUTHLANE_OAUTH_GITHUB_CLIENT_SECRET
 *   AUTHLANE_OAUTH_GOOGLE_CALENDAR_CLIENT_ID / AUTHLANE_OAUTH_GOOGLE_CALENDAR_CLIENT_SECRET
 *
 * Platform credentials are shared by every tenant that has not configured its own, so the consent
 * screen shows the Authlane application rather than the tenant's brand.
 */

export interface PlatformOAuthCredentials {
  clientId: string;
  clientSecret: string;
}

/** Environment variable prefix for a service, e.g. `google-drive` to `AUTHLANE_OAUTH_GOOGLE_DRIVE`. */
export function platformOAuthEnvPrefix(serviceId: string): string {
  return `AUTHLANE_OAUTH_${serviceId.replaceAll('-', '_').toUpperCase()}`;
}

/**
 * Reads the platform-wide OAuth application for a service. Returns null unless a client id is
 * present; a missing secret is allowed because public clients authenticate with PKCE alone.
 */
export function getPlatformOAuthCredentials(serviceId: string): PlatformOAuthCredentials | null {
  const prefix = platformOAuthEnvPrefix(serviceId);
  const clientId = process.env[`${prefix}_CLIENT_ID`]?.trim();
  if (!clientId) return null;
  return { clientId, clientSecret: process.env[`${prefix}_CLIENT_SECRET`]?.trim() ?? '' };
}

/** True when a service can complete OAuth without any tenant-supplied application. */
export function hasPlatformOAuthCredentials(serviceId: string): boolean {
  return getPlatformOAuthCredentials(serviceId) !== null;
}
