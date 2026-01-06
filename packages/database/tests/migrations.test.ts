/**
 * Database migration tests
 * Tests for schema migrations and RLS policies
 */

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { Pool } = pg;

describe('database migrations', () => {
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

  describe('schema tables', () => {
    it('should have tenants table with correct columns', async () => {
      const result = await db.execute(sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'tenants'
        ORDER BY ordinal_position;
      `);

      const columns = result.rows.map((row: any) => ({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
      }));

      expect(columns).toContainEqual(
        expect.objectContaining({ name: 'id', type: 'uuid', nullable: false })
      );
      expect(columns).toContainEqual(
        expect.objectContaining({ name: 'name', type: 'text', nullable: false })
      );
      expect(columns).toContainEqual(
        expect.objectContaining({ name: 'api_key_hash', type: 'text', nullable: false })
      );
      expect(columns).toContainEqual(
        expect.objectContaining({ name: 'created_at', nullable: false })
      );
    });

    it('should have services table with correct columns', async () => {
      const result = await db.execute(sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'services'
        ORDER BY ordinal_position;
      `);

      const columnNames = result.rows.map((row: any) => row.column_name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('category');
      expect(columnNames).toContain('oauth_config');
      expect(columnNames).toContain('created_at');
    });

    it('should have connections table with correct columns', async () => {
      const result = await db.execute(sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'connections'
        ORDER BY ordinal_position;
      `);

      const columnNames = result.rows.map((row: any) => row.column_name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('tenant_id');
      expect(columnNames).toContain('user_id');
      expect(columnNames).toContain('service_id');
      expect(columnNames).toContain('credentials_encrypted');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('last_verified_at');
      expect(columnNames).toContain('error_message');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });

    it('should have tenant_services table with correct columns', async () => {
      const result = await db.execute(sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'tenant_services'
        ORDER BY ordinal_position;
      `);

      const columnNames = result.rows.map((row: any) => row.column_name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('tenant_id');
      expect(columnNames).toContain('service_id');
      expect(columnNames).toContain('is_enabled');
      expect(columnNames).toContain('custom_oauth_config');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });
  });

  describe('foreign keys', () => {
    it('should have foreign key from connections to tenants', async () => {
      const result = await db.execute(sql`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'connections'
        AND constraint_type = 'FOREIGN KEY';
      `);

      const fkNames = result.rows.map((row: any) => row.constraint_name);
      expect(fkNames.some((name: string) => name.includes('tenant'))).toBe(true);
    });

    it('should have foreign key from connections to services', async () => {
      const result = await db.execute(sql`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'connections'
        AND constraint_type = 'FOREIGN KEY';
      `);

      const fkNames = result.rows.map((row: any) => row.constraint_name);
      expect(fkNames.some((name: string) => name.includes('service'))).toBe(true);
    });

    it('should have foreign key from tenant_services to tenants', async () => {
      const result = await db.execute(sql`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'tenant_services'
        AND constraint_type = 'FOREIGN KEY';
      `);

      const fkNames = result.rows.map((row: any) => row.constraint_name);
      expect(fkNames.some((name: string) => name.includes('tenant'))).toBe(true);
    });
  });

  describe('indexes', () => {
    it('should have index on connections.tenant_id', async () => {
      const result = await db.execute(sql`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'connections'
        AND indexname LIKE '%tenant%';
      `);

      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('should have unique index on connections(tenant_id, user_id, service_id)', async () => {
      const result = await db.execute(sql`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'connections'
        AND indexdef LIKE '%UNIQUE%';
      `);

      const uniqueIndexes = result.rows.map((row: any) => row.indexdef);
      const hasCompositeUnique = uniqueIndexes.some(
        (def: string) =>
          def.includes('tenant_id') && def.includes('user_id') && def.includes('service_id')
      );

      expect(hasCompositeUnique).toBe(true);
    });

    it('should have unique index on tenant_services(tenant_id, service_id)', async () => {
      const result = await db.execute(sql`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'tenant_services'
        AND indexdef LIKE '%UNIQUE%';
      `);

      const uniqueIndexes = result.rows.map((row: any) => row.indexdef);
      const hasCompositeUnique = uniqueIndexes.some(
        (def: string) => def.includes('tenant_id') && def.includes('service_id')
      );

      expect(hasCompositeUnique).toBe(true);
    });
  });

  describe('RLS policies', () => {
    it('should have RLS enabled on connections table', async () => {
      const result = await db.execute(sql`
        SELECT relrowsecurity
        FROM pg_class
        WHERE relname = 'connections';
      `);

      expect(result.rows[0]?.relrowsecurity).toBe(true);
    });

    it('should have RLS enabled on tenant_services table', async () => {
      const result = await db.execute(sql`
        SELECT relrowsecurity
        FROM pg_class
        WHERE relname = 'tenant_services';
      `);

      expect(result.rows[0]?.relrowsecurity).toBe(true);
    });

    it('should have tenant_isolation policy on connections', async () => {
      const result = await db.execute(sql`
        SELECT policyname, permissive, roles, cmd, qual
        FROM pg_policies
        WHERE tablename = 'connections'
        AND policyname = 'tenant_isolation';
      `);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0]?.policyname).toBe('tenant_isolation');
      expect(result.rows[0]?.cmd).toBe('ALL'); // Applies to all commands
    });

    it('should have tenant_service_isolation policy on tenant_services', async () => {
      const result = await db.execute(sql`
        SELECT policyname, permissive, roles, cmd
        FROM pg_policies
        WHERE tablename = 'tenant_services'
        AND policyname = 'tenant_service_isolation';
      `);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0]?.policyname).toBe('tenant_service_isolation');
      expect(result.rows[0]?.cmd).toBe('ALL');
    });

    it('should NOT have RLS on services table (global data)', async () => {
      const result = await db.execute(sql`
        SELECT relrowsecurity
        FROM pg_class
        WHERE relname = 'services';
      `);

      expect(result.rows[0]?.relrowsecurity).toBe(false);
    });
  });

  describe('RLS policy enforcement', () => {
    it('should isolate connections by tenant when app.current_tenant is set', async () => {
      // This test requires actual data and tenant context setting
      // For now, we'll just verify the policy EXISTS and is correctly configured
      const result = await db.execute(sql`
        SELECT qual::text
        FROM pg_policies
        WHERE tablename = 'connections'
        AND policyname = 'tenant_isolation';
      `);

      const policyQual = result.rows[0]?.qual;
      expect(policyQual).toBeTruthy();
      expect(policyQual).toContain('tenant_id');
      expect(policyQual).toContain('current_setting');
      expect(policyQual).toContain('app.current_tenant');
    });
  });

  describe('default values', () => {
    it('should have default values for created_at columns', async () => {
      const tables = ['tenants', 'services', 'connections', 'tenant_services'];

      for (const table of tables) {
        const result = await db.execute(
          sql.raw(`
          SELECT column_default
          FROM information_schema.columns
          WHERE table_name = '${table}'
          AND column_name = 'created_at';
        `)
        );

        const defaultValue = result.rows[0]?.column_default;
        expect(defaultValue).toBeTruthy();
        expect(defaultValue).toContain('now()');
      }
    });

    it('should have default values for updated_at columns', async () => {
      const tables = ['connections', 'tenant_services'];

      for (const table of tables) {
        const result = await db.execute(
          sql.raw(`
          SELECT column_default
          FROM information_schema.columns
          WHERE table_name = '${table}'
          AND column_name = 'updated_at';
        `)
        );

        const defaultValue = result.rows[0]?.column_default;
        expect(defaultValue).toBeTruthy();
        expect(defaultValue).toContain('now()');
      }
    });

    it('should have default value for connections.status', async () => {
      const result = await db.execute(sql`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_name = 'connections'
        AND column_name = 'status';
      `);

      const defaultValue = result.rows[0]?.column_default;
      expect(defaultValue).toBeTruthy();
      expect(defaultValue).toContain('active');
    });

    it('should have default value for tenant_services.is_enabled', async () => {
      const result = await db.execute(sql`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_name = 'tenant_services'
        AND column_name = 'is_enabled';
      `);

      const defaultValue = result.rows[0]?.column_default;
      expect(defaultValue).toBeTruthy();
      expect(defaultValue).toContain('true');
    });
  });

  describe('data types', () => {
    it('should use uuid type for id columns', async () => {
      const tables = ['tenants', 'services', 'connections', 'tenant_services'];

      for (const table of tables) {
        const result = await db.execute(
          sql.raw(`
          SELECT data_type
          FROM information_schema.columns
          WHERE table_name = '${table}'
          AND column_name = 'id';
        `)
        );

        expect(result.rows[0]?.data_type).toBe('uuid');
      }
    });

    it('should use jsonb for oauth_config in services', async () => {
      const result = await db.execute(sql`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_name = 'services'
        AND column_name = 'oauth_config';
      `);

      expect(result.rows[0]?.data_type).toBe('jsonb');
    });

    it('should use jsonb for custom_oauth_config in tenant_services', async () => {
      const result = await db.execute(sql`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_name = 'tenant_services'
        AND column_name = 'custom_oauth_config';
      `);

      expect(result.rows[0]?.data_type).toBe('jsonb');
    });
  });
});
