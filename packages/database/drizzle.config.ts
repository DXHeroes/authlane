import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './dist/schema/index.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/authlane',
  },
  verbose: true,
  strict: true,
  migrations: {
    table: 'drizzle_migrations',
  },
});
