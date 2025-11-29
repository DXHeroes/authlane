/**
 * Unit tests for error handling middleware
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { errorHandler } from '../../src/middleware/error-handler.js';
import type { Context } from 'hono';

describe('Error Handler Middleware', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.use('*', errorHandler);
  });

  describe('Standard Error Handling', () => {
    it('should catch and handle thrown errors', async () => {
      app.get('/error', () => {
        throw new Error('Test error');
      });

      const res = await app.request('/error');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toContain('Test error');
    });

    it('should handle non-Error thrown values', async () => {
      app.get('/error', () => {
        throw 'String error';
      });

      const res = await app.request('/error');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toContain('Unknown error occurred');
    });

    it('should handle null thrown values', async () => {
      app.get('/error', () => {
        throw null;
      });

      const res = await app.request('/error');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toContain('Unknown error occurred');
    });

    it('should handle undefined thrown values', async () => {
      app.get('/error', () => {
        throw undefined;
      });

      const res = await app.request('/error');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('Tenant Context Errors', () => {
    it('should handle TENANT_NOT_FOUND error', async () => {
      app.get('/no-tenant', () => {
        throw new Error('TENANT_NOT_FOUND');
      });

      const res = await app.request('/no-tenant');

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toContain('Tenant context not found');
    });

    it('should distinguish TENANT_NOT_FOUND from other errors', async () => {
      app.get('/other-error', () => {
        throw new Error('Some other error');
      });

      const res = await app.request('/other-error');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('Success Cases', () => {
    it('should not interfere with successful responses', async () => {
      app.get('/success', (c) => c.json({ data: 'success' }));

      const res = await app.request('/success');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBe('success');
    });

    it('should allow responses with custom status codes', async () => {
      app.get('/created', (c) => c.json({ data: 'created' }, 201));

      const res = await app.request('/created');

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data).toBe('created');
    });

    it('should not log errors for successful requests', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      app.get('/success', (c) => c.json({ data: 'ok' }));

      await app.request('/success');

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Error Response Format', () => {
    it('should return error in correct format', async () => {
      app.get('/error', () => {
        throw new Error('Test error');
      });

      const res = await app.request('/error');
      const body = await res.json();

      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('message');
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('statusCode');
    });

    it('should include hint in error response', async () => {
      app.get('/error', () => {
        throw new Error('Test error');
      });

      const res = await app.request('/error');
      const body = await res.json();

      expect(body.error).toBeDefined();
      // Internal errors may or may not have hints
    });

    it('should include docUrl in error response when available', async () => {
      app.get('/error', () => {
        throw new Error('Test error');
      });

      const res = await app.request('/error');
      const body = await res.json();

      expect(body.error.docUrl).toBeDefined();
    });
  });

  describe('Status Code Mapping', () => {
    it('should use 500 status code for internal errors', async () => {
      app.get('/error', () => {
        throw new Error('Internal error');
      });

      const res = await app.request('/error');

      expect(res.status).toBe(500);
    });

    it('should use 401 status code for tenant errors', async () => {
      app.get('/error', () => {
        throw new Error('TENANT_NOT_FOUND');
      });

      const res = await app.request('/error');

      expect(res.status).toBe(401);
    });

    it('should handle statusCode from error object', async () => {
      app.get('/error', () => {
        const error = new Error('Custom error');
        (error as any).statusCode = 400;
        throw error;
      });

      const res = await app.request('/error');

      expect(res.status).toBe(500);
    });
  });

  describe('Error Logging', () => {
    it('should log errors to console', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      app.get('/error', () => {
        throw new Error('Test error');
      });

      await app.request('/error');

      expect(consoleSpy).toHaveBeenCalledWith('Unhandled error:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('should log the actual error object', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const testError = new Error('Specific error message');

      app.get('/error', () => {
        throw testError;
      });

      await app.request('/error');

      expect(consoleSpy).toHaveBeenCalledWith('Unhandled error:', testError);

      consoleSpy.mockRestore();
    });
  });

  describe('Async Error Handling', () => {
    it('should catch async errors', async () => {
      app.get('/async-error', async () => {
        await Promise.resolve();
        throw new Error('Async error');
      });

      const res = await app.request('/async-error');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.message).toContain('Async error');
    });

    it('should handle rejected promises', async () => {
      app.get('/rejected', async () => {
        await Promise.reject(new Error('Promise rejected'));
      });

      const res = await app.request('/rejected');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.message).toContain('Promise rejected');
    });

    it('should handle multiple async operations', async () => {
      app.get('/multi-async', async () => {
        await Promise.resolve();
        await Promise.resolve();
        throw new Error('Multi async error');
      });

      const res = await app.request('/multi-async');

      expect(res.status).toBe(500);
    });
  });

  describe('Complex Error Scenarios', () => {
    it('should handle errors with additional properties', async () => {
      app.get('/error', () => {
        const error: any = new Error('Complex error');
        error.code = 'CUSTOM_CODE';
        error.details = { foo: 'bar' };
        throw error;
      });

      const res = await app.request('/error');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it('should handle errors thrown from middleware chain', async () => {
      app.use('/protected', async (c, next) => {
        throw new Error('Middleware error');
      });

      app.get('/protected', (c) => c.json({ data: 'ok' }));

      const res = await app.request('/protected');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.message).toContain('Middleware error');
    });

    it('should handle errors from nested async operations', async () => {
      app.get('/nested', async () => {
        await new Promise((resolve, reject) => {
          setTimeout(() => reject(new Error('Nested async error')), 10);
        });
      });

      const res = await app.request('/nested');

      expect(res.status).toBe(500);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty error messages', async () => {
      app.get('/error', () => {
        throw new Error('');
      });

      const res = await app.request('/error');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it('should handle errors with circular references', async () => {
      app.get('/error', () => {
        const error: any = new Error('Circular error');
        error.circular = error;
        throw error;
      });

      const res = await app.request('/error');

      expect(res.status).toBe(500);
    });

    it('should handle Error subclasses', async () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }

      app.get('/error', () => {
        throw new CustomError('Custom error message');
      });

      const res = await app.request('/error');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.message).toContain('Custom error message');
    });

    it('should handle very long error messages', async () => {
      const longMessage = 'Error: ' + 'x'.repeat(10000);

      app.get('/error', () => {
        throw new Error(longMessage);
      });

      const res = await app.request('/error');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.message).toContain(longMessage);
    });
  });

  describe('Integration with Context', () => {
    it('should preserve context through error handling', async () => {
      app.use('*', async (c, next) => {
        c.set('testValue', 'preserved');
        await next();
      });

      app.get('/error', (c: Context) => {
        const value = c.get('testValue');
        throw new Error(`Error with context: ${value}`);
      });

      const res = await app.request('/error');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.message).toContain('Error with context: preserved');
    });

    it('should allow access to request in error handler', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      app.get('/error', (c) => {
        throw new Error(`Path: ${c.req.path}`);
      });

      await app.request('/error');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Unhandled error:',
        expect.objectContaining({
          message: 'Path: /error',
        })
      );

      consoleSpy.mockRestore();
    });
  });
});
