/**
 * The SmartStaff OAuth client for local development.
 *
 * Pairing SmartStaff against a local Authlane otherwise costs a dashboard round-trip on every fresh
 * database: register a client, copy a generated id, copy a secret that is shown once, paste both
 * into another repository's .env. A fixed pair removes that, at the price of being a credential
 * checked into the tree — so this never runs against production, and the ordinary `pnpm db:seed`
 * does not call it. It is seeded by the local demo bootstrap, which already provisions a workspace
 * and an account to sign in with, and by the `seed:oauth-client` script for a developer who made
 * their own workspace instead.
 *
 * The secret goes through @authlane/crypto's `encryptOAuthClientSecret`, the same envelope the
 * token endpoint decrypts. Any other spelling of the column fails at token exchange.
 *
 * Deliberately not re-exported from the package index, the way `seed-catalog.ts` is not: importing
 * it would pull a fixed plaintext credential and a top-level `process.exit` block into every app
 * that imports @authlane/database. Reach it by the `@authlane/database/seed-oauth-client` subpath.
 */

import { encryptOAuthClientSecret } from '@authlane/crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Database } from './client.js';
import { oauthApplication } from './schema/index.js';

/**
 * SmartStaff's callback in local development. Its dev server runs on port 3000, and the URI is
 * compared byte for byte at the authorize endpoint, so this string is the contract.
 */
const SMARTSTAFF_DEV_REDIRECT_URI = 'http://localhost:3000/api/integrations/authlane/callback';

export const SMARTSTAFF_DEV_OAUTH_CLIENT = {
  /** Fixed so re-seeding updates the one row rather than adding another. */
  id: 'oauth_client_smartstaff_dev',
  name: 'SmartStaff (local development)',
  clientId: 'authlane_dev_smartstaff_client_id',
  clientSecret: 'authlane_dev_smartstaff_client_secret',
  redirectUri: SMARTSTAFF_DEV_REDIRECT_URI,
} as const;

export type SeedOAuthClientOutcome = 'seeded' | 'skipped-production';

/**
 * Registers the development client against one workspace, or refuses when NODE_ENV says production.
 *
 * That guard reads NODE_ENV and nothing else. It stops the seed running as part of a production
 * process, which is what the demo bootstrap and the CLI are; it does NOT know what database it is
 * pointed at, so a laptop with NODE_ENV unset and DATABASE_URL aimed at production would write this
 * fixed credential there. The callers are developer-invoked by design — do not add one that runs
 * automatically on boot.
 *
 * Idempotent: the row is keyed on the unique `client_id`, so a re-run rewrites the same row even if
 * its primary key differs from the one seeded here. The secret is re-sealed each time, producing a
 * different ciphertext for the same plaintext — the credential a developer configured stays valid.
 *
 * The workspace matters. Authlane's authorize gate only lets a member of the client's organization
 * through, so pairing works for whoever can sign in to `organizationId` and nobody else.
 */
export async function seedSmartStaffDevOAuthClient(
  db: Database,
  organizationId: string
): Promise<SeedOAuthClientOutcome> {
  if (process.env.NODE_ENV === 'production') return 'skipped-production';

  // Everything except the identity columns, so a conflicting row keeps the primary key it already
  // has rather than having it rewritten underneath its foreign keys.
  const attributes = {
    name: SMARTSTAFF_DEV_OAUTH_CLIENT.name,
    clientSecret: await encryptOAuthClientSecret(SMARTSTAFF_DEV_OAUTH_CLIENT.clientSecret),
    redirectUrls: SMARTSTAFF_DEV_OAUTH_CLIENT.redirectUri,
    type: 'web',
    disabled: false,
    // No registering user: the row must survive a demo reset, which deletes the demo account.
    userId: null,
    organizationId,
    updatedAt: new Date(),
  };

  await db
    .insert(oauthApplication)
    .values({
      id: SMARTSTAFF_DEV_OAUTH_CLIENT.id,
      clientId: SMARTSTAFF_DEV_OAUTH_CLIENT.clientId,
      ...attributes,
    })
    .onConflictDoUpdate({ target: oauthApplication.clientId, set: attributes });

  return 'seeded';
}

const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('seed-oauth-client.ts') ||
  process.argv[1]?.endsWith('seed-oauth-client.js');

if (isMainModule) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  // Named rather than defaulted: pairing only works for members of this workspace, so guessing one
  // would hand a developer a client their own account cannot authorize.
  const organizationId = process.argv[2];
  if (!organizationId) {
    console.error(
      'Usage: pnpm --filter @authlane/database seed:oauth-client <organizationId>\n' +
        '  The local demo bootstrap seeds this client for its own workspace already.'
    );
    process.exit(1);
  }

  const client = postgres(dbUrl, { max: 1 });
  const db = drizzle(client, { schema: { oauthApplication } }) as unknown as Database;

  seedSmartStaffDevOAuthClient(db, organizationId)
    .then((outcome) => {
      if (outcome === 'skipped-production') {
        console.error('Refusing to seed a fixed development OAuth client in production');
        process.exit(1);
      }
      console.log(
        [
          `Seeded the SmartStaff development OAuth client for organization ${organizationId}`,
          `  AUTHLANE_CLIENT_ID=${SMARTSTAFF_DEV_OAUTH_CLIENT.clientId}`,
          `  AUTHLANE_CLIENT_SECRET=${SMARTSTAFF_DEV_OAUTH_CLIENT.clientSecret}`,
          `  redirect URI: ${SMARTSTAFF_DEV_OAUTH_CLIENT.redirectUri}`,
        ].join('\n')
      );
      return client.end();
    })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Development OAuth client seed failed', error);
      process.exit(1);
    });
}
