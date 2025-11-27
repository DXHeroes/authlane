/**
 * Database seed script
 * Populates initial data (services, sample tenant)
 */

import { hashApiKey } from '@authlane/shared';
import { eq } from 'drizzle-orm';
import { createDatabaseClient } from './client.js';
import { services, type Tenant, tenants } from './schema/index.js';

/**
 * Seeds the database with initial data
 */
export async function seedDatabase(dbUrl: string) {
  const db = createDatabaseClient(dbUrl);

  console.log('🌱 Seeding database...');

  // Insert sample services
  const sampleServices = [
    {
      id: 'github',
      name: 'GitHub',
      authType: 'oauth2',
      config: {
        authorization_url: 'https://github.com/login/oauth/authorize',
        token_url: 'https://github.com/login/oauth/access_token',
        scopes: ['repo', 'user', 'read:org'],
      },
      enabled: true,
    },
    {
      id: 'slack',
      name: 'Slack',
      authType: 'oauth2',
      config: {
        authorization_url: 'https://slack.com/oauth/v2/authorize',
        token_url: 'https://slack.com/api/oauth.v2.access',
        scopes: ['channels:read', 'chat:write', 'users:read'],
      },
      enabled: true,
    },
  ];

  for (const service of sampleServices) {
    await db.insert(services).values(service).onConflictDoUpdate({
      target: services.id,
      set: service,
    });
    console.log(`  ✓ Seeded service: ${service.name}`);
  }

  // Create a sample tenant (for testing)
  // In production, tenants would be created through the dashboard
  const sampleApiKey = `test_api_key_${Date.now()}`;
  const sampleTenant = {
    name: 'Test Tenant',
    apiKeyHash: hashApiKey(sampleApiKey),
    settings: {},
  };

  let tenant: Tenant | undefined;
  try {
    const result = await db.insert(tenants).values(sampleTenant).returning();
    tenant = result[0];
    if (!tenant) {
      throw new Error('Failed to create tenant - no result returned');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('duplicate')) {
      console.log('  ⚠️  Tenant already exists, skipping...');
      // Try to get existing tenant
      const existing = await db
        .select()
        .from(tenants)
        .where(eq(tenants.apiKeyHash, sampleTenant.apiKeyHash))
        .limit(1);
      if (existing[0]) {
        tenant = existing[0];
        console.log(`  ✓ Using existing tenant: ${tenant.name}`);
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  console.log(`  ✓ Seeded tenant: ${tenant.name}`);
  console.log(`  📝 Test API Key: ${sampleApiKey}`);
  console.log(`  📝 Tenant ID: ${tenant.id}`);

  console.log('✅ Database seeded successfully!');
}

// Run if called directly (check if this is the main module)
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('seed.ts') ||
  process.argv[1]?.endsWith('seed.js');

if (isMainModule) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }
  seedDatabase(dbUrl)
    .then(() => {
      console.log('✅ Done');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seed failed:', error);
      process.exit(1);
    });
}
