/**
 * Tenant context utility tests
 */

import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { getTenantId } from '../../src/utils/tenant-context';

describe('tenant context utilities', () => {
  describe('getTenantId', () => {
    it('should return tenant ID when set in context', async () => {
      const app = new Hono();
      app.get('/test', (c) => {
        c.set('tenantId', 'test-tenant');
        const tenantId = getTenantId(c);
        return c.json({ tenantId });
      });

      const res = await app.request('/test');
      const body = await res.json();
      expect(body.tenantId).toBe('test-tenant');
    });

    it('should throw error when tenant ID not set', async () => {
      const app = new Hono();
      app.get('/test', (c) => {
        try {
          getTenantId(c);
          return c.json({ error: 'should have thrown' });
        } catch (error) {
          return c.json({ error: (error as Error).message });
        }
      });

      const res = await app.request('/test');
      const body = await res.json();
      expect(body.error).toBe('Tenant context not found');
    });

    it('should throw error when tenant ID is not a string', async () => {
      const app = new Hono();
      app.get('/test', (c) => {
        c.set('tenantId', 123 as any);
        try {
          getTenantId(c);
          return c.json({ error: 'should have thrown' });
        } catch (error) {
          return c.json({ error: (error as Error).message });
        }
      });

      const res = await app.request('/test');
      const body = await res.json();
      expect(body.error).toBe('Tenant context not found');
    });
  });
});
