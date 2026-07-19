import { describe, expect, it } from 'vitest';
import {
  magicLinkErrorMessage,
  organizationSlug,
  safeDashboardReturnPath,
} from '@/lib/auth-helpers';

describe('authentication helpers', () => {
  it('creates readable collision-resistant organization slugs', () => {
    expect(organizationSlug('DX Heroes s.r.o.', 'a1b2c3')).toBe('dx-heroes-s-r-o-a1b2c3');
    expect(organizationSlug('   ', 'a1b2c3')).toBe('workspace-a1b2c3');
  });

  it('allows only internal dashboard return paths', () => {
    expect(safeDashboardReturnPath('/dashboard/services?service=github')).toBe(
      '/dashboard/services?service=github'
    );
    expect(safeDashboardReturnPath('https://attacker.test/dashboard')).toBe('/dashboard');
    expect(safeDashboardReturnPath('//attacker.test')).toBe('/dashboard');
    expect(safeDashboardReturnPath('/onboarding')).toBe('/dashboard');
  });

  it('uses one friendly message for invalid, expired, and replayed links', () => {
    expect(magicLinkErrorMessage('INVALID_TOKEN')).toMatch(/invalid, expired, or already used/i);
    expect(magicLinkErrorMessage('expired')).toMatch(/invalid, expired, or already used/i);
    expect(magicLinkErrorMessage('new_user_signup_disabled')).toMatch(
      /sign-up is currently closed/i
    );
  });
});
