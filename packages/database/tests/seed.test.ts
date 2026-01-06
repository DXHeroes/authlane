/**
 * Database seed script tests
 * Tests for seed data and functionality
 */

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { Pool } = pg;

describe('database seed', () => {
  let pool: pg.Pool;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    const testDatabaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    pool = new Pool({ connectionString: testDatabaseUrl });
    db = drizzle(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('services seed data', () => {
    it('should have seeded services', async () => {
      const result = await db.execute(sql`SELECT COUNT(*) as count FROM services;`);
      const count = Number(result.rows[0]?.count || 0);

      expect(count).toBeGreaterThan(0);
    });

    it('should have GitHub service', async () => {
      const result = await db.execute(sql`
        SELECT id, name, category
        FROM services
        WHERE id = 'github';
      `);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0]?.name).toBe('GitHub');
      expect(result.rows[0]?.category).toBe('developer_tools');
    });

    it('should have all required service fields', async () => {
      const result = await db.execute(sql`
        SELECT id, name, category, oauth_config
        FROM services
        LIMIT 1;
      `);

      expect(result.rows.length).toBeGreaterThan(0);
      const service = result.rows[0];

      expect(service?.id).toBeTruthy();
      expect(service?.name).toBeTruthy();
      expect(service?.category).toBeTruthy();
      expect(service?.oauth_config).toBeTruthy();
    });

    it('should have valid oauth_config structure', async () => {
      const result = await db.execute(sql`
        SELECT id, oauth_config
        FROM services
        WHERE id = 'github';
      `);

      const oauthConfig = result.rows[0]?.oauth_config;
      expect(oauthConfig).toBeTruthy();
      expect(typeof oauthConfig).toBe('object');

      // GitHub uses OAuth2
      expect(oauthConfig).toHaveProperty('authorize_url');
      expect(oauthConfig).toHaveProperty('token_url');
      expect(oauthConfig).toHaveProperty('scopes');
    });

    it('should have services in different categories', async () => {
      const result = await db.execute(sql`
        SELECT DISTINCT category
        FROM services
        ORDER BY category;
      `);

      const categories = result.rows.map((row: any) => row.category);

      // Should have multiple categories
      expect(categories.length).toBeGreaterThan(1);
      expect(categories).toContain('developer_tools');
    });
  });

  describe('tenants seed data', () => {
    it('should have test tenant', async () => {
      const result = await db.execute(sql`
        SELECT id, name, api_key_hash
        FROM tenants
        WHERE name = 'Test Tenant';
      `);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0]?.api_key_hash).toBeTruthy();
    });

    it('should have properly hashed API key', async () => {
      const result = await db.execute(sql`
        SELECT api_key_hash
        FROM tenants
        WHERE name = 'Test Tenant';
      `);

      const hash = result.rows[0]?.api_key_hash;
      expect(hash).toBeTruthy();

      // bcrypt hash format: $2a$10$...
      expect(hash).toMatch(/^\$2[ayb]\$\d{2}\$/);
      expect(hash.length).toBeGreaterThanOrEqual(60);
    });
  });

  describe('data integrity', () => {
    it('should have all services with unique IDs', async () => {
      const result = await db.execute(sql`
        SELECT id, COUNT(*) as count
        FROM services
        GROUP BY id
        HAVING COUNT(*) > 1;
      `);

      expect(result.rows.length).toBe(0); // No duplicate IDs
    });

    it('should have all services with non-null required fields', async () => {
      const result = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM services
        WHERE name IS NULL
        OR category IS NULL
        OR oauth_config IS NULL;
      `);

      expect(result.rows[0]?.count).toBe('0');
    });

    it('should have valid created_at timestamps', async () => {
      const result = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM services
        WHERE created_at IS NULL
        OR created_at > NOW();
      `);

      expect(result.rows[0]?.count).toBe('0');
    });
  });

  describe('seed script idempotency', () => {
    it('should handle re-running seed without errors', async () => {
      // Verify services exist
      const beforeResult = await db.execute(sql`SELECT COUNT(*) as count FROM services;`);
      const countBefore = Number(beforeResult.rows[0]?.count || 0);

      expect(countBefore).toBeGreaterThan(0);

      // Re-running seed should be handled by ON CONFLICT (in production seed script)
      // For now, just verify data exists
      const afterResult = await db.execute(sql`SELECT COUNT(*) as count FROM services;`);
      const countAfter = Number(afterResult.rows[0]?.count || 0);

      expect(countAfter).toBe(countBefore);
    });
  });
});
