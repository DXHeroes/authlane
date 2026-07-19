import { isIP } from 'node:net';

export type PublicSurface =
  | { kind: 'landing' }
  | { kind: 'app' }
  | { kind: 'redirect'; location: string }
  | { kind: 'unavailable' };

export interface PublicSurfaceConfig {
  landingHosts: readonly string[];
  appHosts: readonly string[];
}

const DNS_HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function validPort(value: string | undefined): boolean {
  if (value === undefined) return true;
  if (!/^\d{1,5}$/.test(value)) return false;
  const port = Number(value);
  return port >= 1 && port <= 65_535;
}

function normalizeHostname(value: string | undefined): string {
  const authority = value?.trim().toLowerCase();
  if (!authority) return '';

  if (authority.startsWith('[')) {
    const ipv6 = /^\[([^\]]+)](?::([^:]+))?$/.exec(authority);
    const address = ipv6?.[1] ?? '';
    if (!ipv6 || isIP(address) !== 6 || !validPort(ipv6[2])) return '';
    return new URL(`http://[${address}]`).hostname.slice(1, -1);
  }

  const parts = authority.split(':');
  if (parts.length > 2 || !validPort(parts[1])) return '';

  const hostname = (parts[0] ?? '').replace(/\.$/, '');
  if (!DNS_HOSTNAME.test(hostname)) return '';
  return hostname;
}

function isLoopback(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '::1') return true;
  return isIP(hostname) === 4 && hostname.startsWith('127.');
}

export function resolvePublicSurface(
  host: string | undefined,
  config: PublicSurfaceConfig
): PublicSurface {
  const value = normalizeHostname(host);
  if (!value) return { kind: 'unavailable' };

  const landingHosts = config.landingHosts.map(normalizeHostname);
  if (value === 'www.authlane.io' && landingHosts.includes('authlane.io')) {
    return { kind: 'redirect', location: 'https://authlane.io' };
  }
  if (isLoopback(value)) return { kind: 'app' };

  if (landingHosts.includes(value)) return { kind: 'landing' };

  const appHosts = config.appHosts.map(normalizeHostname);
  if (appHosts.includes(value)) return { kind: 'app' };

  return { kind: 'unavailable' };
}

export function canonicalRedirectLocation(
  requestUrl: string,
  origin = 'https://authlane.io'
): string {
  const request = new URL(requestUrl);
  const canonical = new URL(origin);
  canonical.pathname = request.pathname;
  canonical.search = request.search;
  return canonical.toString();
}

export function isDocsPath(path: string): boolean {
  return path === '/docs' || path.startsWith('/docs/');
}

const PRODUCT_PREFIXES = [
  '/api',
  '/connect',
  '/login',
  '/register',
  '/onboarding',
  '/reauth',
  '/two-factor',
  '/dashboard',
];

export function isProductOnlyPath(path: string): boolean {
  return PRODUCT_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
