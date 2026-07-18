import { describe, expect, it } from 'vitest';
import {
  canPerformDestructiveAction,
  createConnectSessionToken,
  filterCurrentlyEnabledServices,
  isUsableConnectSession,
  resolveAllowedServiceSnapshot,
} from '../../src/lib/connect-session.js';

describe('connect sessions', () => {
  it('creates an opaque browser token and stores only its hash', () => {
    const session = createConnectSessionToken();

    expect(session.token).toMatch(/^acs_[A-Za-z0-9_-]{40,}$/);
    expect(session.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(session.tokenHash).not.toContain(session.token);
  });

  it('enforces expiry, revocation, service allowlist, and exact origin', () => {
    const base = {
      expiresAt: new Date('2026-01-01T00:10:00Z'),
      revokedAt: null,
      allowedServices: ['github'],
      allowedOrigin: 'https://saas.example',
    };

    expect(
      isUsableConnectSession(base, 'github', 'https://saas.example', new Date('2026-01-01'))
    ).toBe(true);
    expect(
      isUsableConnectSession(base, 'slack', 'https://saas.example', new Date('2026-01-01'))
    ).toBe(false);
    expect(
      isUsableConnectSession(base, 'github', 'https://evil.example', new Date('2026-01-01'))
    ).toBe(false);
    expect(
      isUsableConnectSession(base, 'github', 'https://saas.example', new Date('2026-01-02'))
    ).toBe(false);
  });

  it('requires a current reauthentication grant for destructive actions', () => {
    expect(
      canPerformDestructiveAction(
        { destructiveActionExpiresAt: new Date('2026-01-01T00:05:00Z') },
        new Date('2026-01-01T00:04:59Z')
      )
    ).toBe(true);
    expect(
      canPerformDestructiveAction(
        { destructiveActionExpiresAt: new Date('2026-01-01T00:05:00Z') },
        new Date('2026-01-01T00:05:00Z')
      )
    ).toBe(false);
    expect(canPerformDestructiveAction({ destructiveActionExpiresAt: null })).toBe(false);
  });
});

describe('connect session service snapshots', () => {
  const enabledServices = ['slack', 'github', 'linear'];

  it('requires allowedServices to be an array', () => {
    expect(resolveAllowedServiceSnapshot(undefined, enabledServices)).toMatchObject({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation error: allowedServices is required and must be an array',
      },
    });
    expect(resolveAllowedServiceSnapshot('github', enabledServices)).toMatchObject({
      data: null,
      error: { code: 'VALIDATION_ERROR' },
    });
  });

  it('turns an empty array into a deterministic concrete snapshot', () => {
    expect(resolveAllowedServiceSnapshot([], enabledServices)).toEqual({
      data: ['github', 'linear', 'slack'],
      error: null,
    });
  });

  it('deduplicates explicit services while preserving their requested order', () => {
    expect(resolveAllowedServiceSnapshot(['slack', 'github', 'slack'], enabledServices)).toEqual({
      data: ['slack', 'github'],
      error: null,
    });
  });

  it('rejects invalid and unavailable explicit service IDs', () => {
    expect(resolveAllowedServiceSnapshot(['GitHub'], enabledServices)).toMatchObject({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation error: allowedServices contains an invalid service ID: GitHub',
      },
    });
    expect(resolveAllowedServiceSnapshot(['github', 'notion'], enabledServices)).toMatchObject({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation error: These services are not currently enabled: notion',
      },
    });
  });

  it('fails closed when an empty array resolves to no enabled services', () => {
    expect(resolveAllowedServiceSnapshot([], [])).toMatchObject({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation error: No services are currently enabled for this organization',
        hint: 'Enable at least one service before creating a connect session',
      },
    });
  });

  it('hides snapshotted services that are no longer enabled', () => {
    expect(
      filterCurrentlyEnabledServices(['github', 'slack', 'linear'], ['linear', 'github'])
    ).toEqual(['github', 'linear']);
  });
});
