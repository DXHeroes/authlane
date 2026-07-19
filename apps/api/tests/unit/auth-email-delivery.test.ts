import { describe, expect, it } from 'vitest';
import { requireEmailDelivery } from '../../src/lib/auth-email-delivery.js';

describe('authentication email delivery', () => {
  it('allows Better Auth to continue only after confirmed delivery', () => {
    expect(() => requireEmailDelivery({ success: true, messageId: 'email_1' })).not.toThrow();
  });

  it('turns provider rejection into a generic authentication failure', () => {
    expect(() =>
      requireEmailDelivery({ success: false, error: 'secret provider diagnostic' })
    ).toThrow('Authentication email delivery failed');
  });
});
