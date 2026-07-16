import { describe, expect, it } from 'vitest';
import {
  canPerformDestructiveAction,
  createConnectSessionToken,
  isUsableConnectSession,
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
