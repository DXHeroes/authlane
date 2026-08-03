import { describe, expect, it } from 'vitest';
import { resolveInviterName } from '../../src/lib/invitations.js';

describe('resolveInviterName', () => {
  it('prefers the display name', async () => {
    await expect(
      resolveInviterName(async () => ({ name: 'Prokop Simek', email: 'prokop@example.com' }))
    ).resolves.toBe('Prokop Simek');
  });

  it('falls back to the email when the name is empty', async () => {
    await expect(
      resolveInviterName(async () => ({ name: '   ', email: 'prokop@example.com' }))
    ).resolves.toBe('prokop@example.com');
  });

  it('falls back to the email when the name is null', async () => {
    await expect(
      resolveInviterName(async () => ({ name: null, email: 'prokop@example.com' }))
    ).resolves.toBe('prokop@example.com');
  });

  it('falls back to a neutral label when the user is gone', async () => {
    await expect(resolveInviterName(async () => undefined)).resolves.toBe('A team member');
  });

  it('never fails the invitation because the lookup failed', async () => {
    await expect(
      resolveInviterName(async () => {
        throw new Error('database unavailable');
      })
    ).resolves.toBe('A team member');
  });
});
