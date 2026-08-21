/**
 * What a consuming application needs to draw a service, resolved the one way.
 *
 * Every product integrating Authlane used to carry its own map from service id to logo and copy,
 * because the API sent nothing but a name. Those maps drifted from each other and from the
 * integration manifests. The columns behind this live in `services`; this turns a row into the
 * shape that goes on the wire.
 */

import type { ServiceCategory } from '@authlane/shared';

export interface ServiceBrandingRow {
  name: string;
  description: string | null;
  iconPath: string | null;
  brandColor: string | null;
  initials: string | null;
  category: string | null;
}

export interface ServiceBranding {
  description: string | null;
  /** Absolute, so it resolves from a consumer's own page and not only from Authlane's origin. */
  iconUrl: string | null;
  brandColor: string | null;
  /** Never null: something always has to render, even for a row that stores no branding. */
  initials: string;
  category: ServiceCategory | null;
}

/**
 * One or two characters standing in for a mark.
 *
 * Stored per service where it matters — GitHub reads as GH, not GI, and the three Microsoft
 * services would otherwise all be MI — and derived here for every row that stores none: the demo
 * provider, and a tenant's own MCP servers.
 */
export function deriveInitials(name: string): string {
  const [first, second] = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (!first) return '?';
  if (!second) return first.slice(0, 2).toUpperCase();
  return `${first[0]}${second[0]}`.toUpperCase();
}

/**
 * `apiBaseUrl` comes from the request, which is why this runs in a route and never in the
 * repository: the catalogue is cached per organization under a key with no host in it, so an
 * origin resolved once would be handed to every later request from any other host.
 */
export function brandingOf(row: ServiceBrandingRow, apiBaseUrl: string): ServiceBranding {
  return {
    description: row.description,
    // An absolute stored path passes through unchanged, which is the shape a tenant-supplied icon
    // would take if MCP servers ever carry one.
    iconUrl: row.iconPath ? new URL(row.iconPath, apiBaseUrl).toString() : null,
    brandColor: row.brandColor,
    initials: row.initials ?? deriveInitials(row.name),
    category: (row.category as ServiceCategory | null) ?? null,
  };
}
