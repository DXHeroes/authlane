/**
 * Database creation script
 * Creates the PostgreSQL database if it doesn't exist
 */

import postgres from 'postgres';

async function createDatabase() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  // Parse DATABASE_URL to extract database name and create admin connection
  const url = new URL(dbUrl);
  const dbName = url.pathname.slice(1); // Remove leading slash

  if (!dbName) {
    console.error('❌ Could not extract database name from DATABASE_URL');
    process.exit(1);
  }

  // Connect to 'postgres' default database to create the target database
  url.pathname = '/postgres';
  const adminUrl = url.toString();

  console.log(`🔄 Creating database "${dbName}"...`);

  try {
    const client = postgres(adminUrl, { max: 1 });

    // Check if database already exists
    const existing = await client`
      SELECT 1 FROM pg_database WHERE datname = ${dbName}
    `;

    if (existing.length > 0) {
      console.log(`✅ Database "${dbName}" already exists`);
      await client.end();
      process.exit(0);
    }

    // Create database
    await client.unsafe(`CREATE DATABASE "${dbName}"`);
    await client.end();

    console.log(`✅ Database "${dbName}" created successfully!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Database creation failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    process.exit(1);
  }
}

createDatabase();
