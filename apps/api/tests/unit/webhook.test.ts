import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { deliverWebhook, signWebhook } from '../../src/jobs/outbox.js';
import { assertOpenApiWebhook } from '../helpers/openapi-response.js';

describe('webhook delivery', () => {
  it('signs the exact timestamp and JSON payload', () => {
    const body = '{"event":"connection.connected"}';
    expect(signWebhook('secret', '123', body)).toBe(
      createHmac('sha256', 'secret').update(`123.${body}`).digest('hex')
    );
  });

  it('sends an idempotent signed event', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const result = await deliverWebhook(
      fetchFn,
      {
        id: 'event_1',
        eventType: 'connection.connected',
        payload: { externalUserId: 'user_1', serviceId: 'github', connectionId: 'connection_1' },
        createdAt: new Date('2025-12-31T23:59:00Z'),
      },
      { url: 'https://saas.test/webhooks/authlane', secret: 'secret' },
      new Date('2026-01-01T00:00:00Z')
    );

    expect(result).toEqual({ delivered: true, error: null });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://saas.test/webhooks/authlane',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Idempotency-Key': 'event_1',
          'X-Authlane-Event': 'connection.connected',
          'X-Authlane-Timestamp': '1767225600',
          'X-Authlane-Signature': expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      })
    );
    const request = fetchFn.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body).toMatchObject({
      id: 'event_1',
      type: 'connection.connected',
      createdAt: '2025-12-31T23:59:00.000Z',
      data: { externalUserId: 'user_1', serviceId: 'github', connectionId: 'connection_1' },
    });
    assertOpenApiWebhook(body);
  });
});
