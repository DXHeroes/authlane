import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

type DrizzleDatabase = ReturnType<typeof drizzle<typeof schema>>;
type DatabaseExecutor =
  | DrizzleDatabase
  | Parameters<Parameters<DrizzleDatabase['transaction']>[0]>[0];

interface DatabaseContext {
  root: DrizzleDatabase;
  executor: DatabaseExecutor;
  organizationId?: string;
}

const asyncDatabaseContext = new AsyncLocalStorage<DatabaseContext>();
const databaseRoots = new WeakMap<object, DrizzleDatabase>();

function contextualDatabase(root: DrizzleDatabase): DrizzleDatabase {
  const proxy = new Proxy(root, {
    get(target, property, receiver) {
      const context = asyncDatabaseContext.getStore();
      const executor = context?.root === root ? context.executor : target;
      const value = Reflect.get(executor, property, receiver);
      return typeof value === 'function' ? value.bind(executor) : value;
    },
  });
  databaseRoots.set(proxy, root);
  return proxy;
}

/** Creates the request-context-aware Drizzle client used by the API. */
export function createDatabaseClient(connectionString: string) {
  const client = postgres(connectionString, {
    max: Number(process.env.DATABASE_POOL_SIZE || 10),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: true,
  });
  return contextualDatabase(drizzle(client, { schema }));
}

export type Database = ReturnType<typeof createDatabaseClient>;

async function runWithSettings<T>(
  db: Database,
  settings: Record<string, string>,
  operation: () => Promise<T>,
  organizationId?: string
): Promise<T> {
  const root = databaseRoots.get(db as object);
  if (!root) return operation();
  const active = asyncDatabaseContext.getStore();
  if (active?.root === root) {
    if (organizationId && active.organizationId && active.organizationId !== organizationId) {
      throw new Error('Cross-tenant database context switch was blocked');
    }
    return operation();
  }
  return root.transaction(async (tx) => {
    for (const [name, value] of Object.entries(settings)) {
      await tx.execute(sql`select set_config(${name}, ${value}, true)`);
    }
    return asyncDatabaseContext.run({ root, executor: tx, organizationId }, operation);
  });
}

/** Runs all database work in one transaction with the enforced RLS tenant context. */
export function withTenantContext<T>(
  db: Database,
  organizationId: string,
  operation: () => Promise<T>
): Promise<T> {
  if (!organizationId) throw new Error('Organization context is required');
  return runWithSettings(
    db,
    { 'authlane.organization_id': organizationId },
    operation,
    organizationId
  );
}

/** Performs the narrow pre-authentication lookup permitted by an RLS lookup policy. */
export function withSecurityLookupContext<T>(
  db: Database,
  setting: 'authlane.api_key_id' | 'authlane.connect_token_hash' | 'authlane.oauth_state_hash',
  value: string,
  operation: () => Promise<T>
): Promise<T> {
  if (!value) throw new Error('Security lookup value is required');
  return runWithSettings(db, { [setting]: value }, operation);
}
