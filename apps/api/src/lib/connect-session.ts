import { randomBytes } from 'node:crypto';
import { hashApiKey } from '@authlane/shared';

export interface ConnectSessionPolicy {
  expiresAt: Date;
  revokedAt: Date | null;
  allowedServices: string[];
  allowedOrigin: string;
}

export interface DestructiveActionPolicy {
  destructiveActionExpiresAt: Date | null;
}

export function createConnectSessionToken(): { token: string; tokenHash: string } {
  const token = `acs_${randomBytes(32).toString('base64url')}`;
  return { token, tokenHash: hashApiKey(token) };
}

export function canPerformDestructiveAction(
  session: DestructiveActionPolicy,
  now: Date = new Date()
): boolean {
  return Boolean(session.destructiveActionExpiresAt && session.destructiveActionExpiresAt > now);
}

export function isUsableConnectSession(
  session: ConnectSessionPolicy,
  serviceId: string,
  origin: string,
  now: Date = new Date()
): boolean {
  return (
    !session.revokedAt &&
    session.expiresAt.getTime() > now.getTime() &&
    session.allowedServices.includes(serviceId) &&
    session.allowedOrigin === origin
  );
}
