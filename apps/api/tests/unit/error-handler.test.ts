import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { handleError } from '../../src/middleware/error-handler.js';

function appWithError(error: unknown) {
  const app = new Hono();
  app.onError(handleError);
  app.get('/error', () => {
    throw error;
  });
  return app;
}

describe('error handler', () => {
  it('returns the SDK error envelope for unexpected errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await appWithError(new Error('database unavailable')).request('/error');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: expect.objectContaining({
        code: 'INTERNAL_ERROR',
        message: 'Internal error: database unavailable',
        statusCode: 500,
      }),
    });
    expect(consoleSpy).toHaveBeenCalledWith('Unhandled error:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('maps a missing tenant context to unauthorized', async () => {
    const response = await appWithError(new Error('TENANT_NOT_FOUND')).request('/error');

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('does not change successful responses', async () => {
    const app = new Hono();
    app.onError(handleError);
    app.get('/ok', (c) => c.json({ data: 'ok', error: null }));

    const response = await app.request('/ok');
    expect(response.status).toBe(200);
  });
});
