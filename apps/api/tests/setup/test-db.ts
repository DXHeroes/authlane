/**
 * Test database utilities
 * Provides test database setup and teardown
 */

import { connections, services, tenantServices, tenants, type Database } from '@authlane/database';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

let testDb: any = null;
let sqlite: any = null;

/**
 * Get or create test database instance (using in-memory SQLite for testing)
 */
export function getTestDb(): Database {
  if (!testDb) {
    // Use in-memory SQLite database for tests
    sqlite = new Database(':memory:');
    testDb = drizzle(sqlite);

    // Create tables
    try {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS tenants (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          api_key_hash TEXT NOT NULL UNIQUE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS services (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          auth_type TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          config TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tenant_services (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          tenant_id TEXT NOT NULL,
          service_id TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          oauth_client_id TEXT,
          oauth_client_secret_enc TEXT,
          custom_scopes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(tenant_id, service_id),
          FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
          FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS connections (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          tenant_id TEXT NOT NULL,
          external_user_id TEXT NOT NULL,
          service_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          credentials_enc TEXT,
          metadata TEXT DEFAULT '{}',
          connected_at DATETIME,
          expires_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(tenant_id, external_user_id, service_id),
          FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
          FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
        );
      `);
    } catch (error) {
      console.error('Failed to create test tables:', error);
    }
  }
  return testDb;
}

/**
 * Clean all tables in the test database
 */
export async function cleanDatabase(db: Database): Promise<void> {
  try {
    await db.delete(connections);
    await db.delete(tenantServices);
    await db.delete(tenants);
    await db.delete(services);
  } catch (error) {
    // Tables might not exist yet
  }
}

/**
 * Close test database connection
 */
export async function closeTestDb(): Promise<void> {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    testDb = null;
  }
}
