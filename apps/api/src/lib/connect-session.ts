import { randomBytes } from 'node:crypto';
import { Errors, hashApiKey, isValidServiceId, type Result } from '@authlane/shared';

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

/**
 * Resolves a request allowlist to the concrete service IDs stored on a session.
 * An empty request snapshots every service that is currently enabled for the tenant.
 */
export function resolveAllowedServiceSnapshot(
  requestedServices: unknown,
  enabledServiceIds: readonly string[]
): Result<string[]> {
  if (!Array.isArray(requestedServices)) {
    return {
      data: null,
      error: Errors.validationError(
        'allowedServices is required and must be an array',
        'Pass an array of service IDs, or [] to snapshot every currently enabled service'
      ),
    };
  }

  const invalidServiceId = requestedServices.find((serviceId) => !isValidServiceId(serviceId));
  if (invalidServiceId !== undefined) {
    return {
      data: null,
      error: Errors.validationError(
        `allowedServices contains an invalid service ID: ${String(invalidServiceId)}`,
        'Use lowercase service IDs containing only letters, numbers, and hyphens'
      ),
    };
  }

  const enabled = new Set(enabledServiceIds);
  if (requestedServices.length === 0) {
    const snapshot = [...enabled].sort();
    if (snapshot.length === 0) {
      return {
        data: null,
        error: Errors.validationError(
          'No services are currently enabled for this organization',
          'Enable at least one service before creating a connect session'
        ),
      };
    }
    return { data: snapshot, error: null };
  }

  const snapshot = [...new Set(requestedServices as string[])];
  const unavailable = snapshot.filter((serviceId) => !enabled.has(serviceId));
  if (unavailable.length > 0) {
    return {
      data: null,
      error: Errors.validationError(
        `These services are not currently enabled: ${unavailable.join(', ')}`,
        'Enable the services for this organization or remove them from allowedServices'
      ),
    };
  }

  return { data: snapshot, error: null };
}

/** Intersects an immutable session snapshot with the tenant's current service policy. */
export function filterCurrentlyEnabledServices(
  snapshottedServiceIds: readonly string[],
  enabledServiceIds: readonly string[]
): string[] {
  const enabled = new Set(enabledServiceIds);
  return snapshottedServiceIds.filter((serviceId) => enabled.has(serviceId));
}
