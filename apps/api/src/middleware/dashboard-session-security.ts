import { Errors } from '@authlane/shared';
import type { Context, Next } from 'hono';
import type { AuthMode } from '../lib/auth-security-config.js';

interface DashboardSessionSecurityOptions {
  authMode: AuthMode;
  trustedOrigins: string[];
  now?: () => Date;
  stepUpMaxAgeSeconds?: number;
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function requestOrigin(c: Context): string | null {
  const origin = c.req.header('origin');
  if (origin) return origin;
  const referer = c.req.header('referer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function dashboardSessionSecurity(options: DashboardSessionSecurityOptions) {
  const trustedOrigins = new Set(options.trustedOrigins);
  const now = options.now ?? (() => new Date());
  const stepUpMaxAgeMs = (options.stepUpMaxAgeSeconds ?? 600) * 1_000;

  return async (c: Context, next: Next) => {
    if (!MUTATING_METHODS.has(c.req.method) || c.get('principal').kind !== 'session') {
      await next();
      return;
    }

    const fetchSite = c.req.header('sec-fetch-site');
    const origin = requestOrigin(c);
    if (fetchSite === 'cross-site' || !origin || !trustedOrigins.has(origin)) {
      return c.json(Errors.csrfFailed(), 403);
    }

    const user = c.get('user');
    if (options.authMode === 'email-password' && !user?.twoFactorEnabled) {
      return c.json(Errors.mfaEnrollmentRequired(), 403);
    }

    const session = c.get('session');
    const createdAt = session?.createdAt ? new Date(session.createdAt).getTime() : Number.NaN;
    const ageMs = now().getTime() - createdAt;
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > stepUpMaxAgeMs) {
      return c.json(Errors.stepUpRequired(), 403);
    }

    await next();
  };
}
