/**
 * Migration runner script
 * Executes Drizzle migrations
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  console.log('🔄 Running database migrations...');
  const maskedUrl = dbUrl.replace(/:[^:@]+@/, ':****@'); // Hide password
  console.log(`📊 Database: ${maskedUrl}`);

  try {
    const client = postgres(dbUrl, { max: 1 });
    const db = drizzle(client, { schema });

    const migrationsFolder = join(__dirname, '../drizzle');
    await migrate(db, { migrationsFolder });

    await client.end();

    console.log('✅ Migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      if (error.message.includes('does not exist')) {
        console.error('💡 Hint: Make sure the database exists. Create it with:');
        console.error('   createdb authlane');
      }
    }
    process.exit(1);
  }
}

runMigrations();
