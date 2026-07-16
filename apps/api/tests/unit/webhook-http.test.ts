import { describe, expect, it } from 'vitest';
import { resolvePublicWebhookAddress, validateWebhookUrl } from '../../src/lib/webhook-http.js';

describe('webhook egress policy', () => {
  it('requires a credential-free HTTPS URL on the default port', () => {
    expect(validateWebhookUrl('https://hooks.example.com/authlane').hostname).toBe(
      'hooks.example.com'
    );
    expect(() => validateWebhookUrl('http://hooks.example.com')).toThrow(/HTTPS/);
    expect(() => validateWebhookUrl('https://user:pass@hooks.example.com')).toThrow(/credentials/);
    expect(() => validateWebhookUrl('https://hooks.example.com:8443')).toThrow(/port/);
  });

  it('rejects DNS answers containing private or loopback addresses', async () => {
    await expect(
      resolvePublicWebhookAddress(new URL('https://hooks.example.com'), async () => [
        { address: '8.8.8.8', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ])
    ).rejects.toThrow(/public IP/);
    await expect(
      resolvePublicWebhookAddress(new URL('https://hooks.example.com'), async () => [
        { address: '8.8.8.8', family: 4 },
      ])
    ).resolves.toEqual({ address: '8.8.8.8', family: 4 });
  });
});
