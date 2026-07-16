import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { seedServiceCatalog } from './service-catalog.js';
import { services } from './schema/index.js';

export async function seedProductionCatalog(dbUrl: string): Promise<void> {
  const client = postgres(dbUrl, { max: 1 });
  const db = drizzle(client, { schema: { services } });

  try {
    await seedServiceCatalog({
      upsertService: async (service) => {
        await db.insert(services).values(service).onConflictDoUpdate({
          target: services.id,
          set: service,
        });
      },
    });
  } finally {
    await client.end();
  }
}

const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('seed-catalog.ts') ||
  process.argv[1]?.endsWith('seed-catalog.js');

if (isMainModule) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  seedProductionCatalog(dbUrl)
    .then(() => {
      console.log('Production service catalog seeded successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Production service catalog seed failed', error);
      process.exit(1);
    });
}
