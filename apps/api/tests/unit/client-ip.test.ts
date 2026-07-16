import { describe, expect, it } from 'vitest';
import { resolveClientIp } from '../../src/lib/client-ip.js';

describe('trusted proxy client IP resolution', () => {
  it('ignores spoofed forwarding headers from untrusted peers', () => {
    expect(resolveClientIp('198.51.100.10', '1.2.3.4', ['10.0.0.0/8'])).toBe('198.51.100.10');
  });

  it('walks a trusted forwarding chain from right to left', () => {
    expect(resolveClientIp('10.0.0.2', '203.0.113.8, 10.0.0.1', ['10.0.0.0/8'])).toBe(
      '203.0.113.8'
    );
  });

  it('fails closed on malformed forwarded addresses', () => {
    expect(resolveClientIp('10.0.0.2', 'attacker, 10.0.0.1', ['10.0.0.0/8'])).toBe('10.0.0.2');
  });
});
