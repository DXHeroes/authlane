import { createHmac } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import postgres from 'postgres';

interface DemoAccess {
  adminEmail: string;
  adminPassword: string;
  apiKey: string;
  organizationId: string;
  externalUserId: string;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for demo E2E`);
  return value;
}

async function demoAccess(): Promise<DemoAccess> {
  return JSON.parse(await readFile(requiredEnvironment('DEMO_ACCESS_FILE'), 'utf8')) as DemoAccess;
}

function decodeBase32(value: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of value.toUpperCase().replaceAll('=', '')) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('Invalid TOTP base32 secret');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

async function totp(uri: string): Promise<string> {
  const url = new URL(uri);
  const encodedSecret = url.searchParams.get('secret');
  if (!encodedSecret) throw new Error('TOTP URI has no secret');
  const seconds = Math.floor(Date.now() / 1_000);
  if (30 - (seconds % 30) < 3) {
    await new Promise((resolve) => setTimeout(resolve, 3_500));
  }
  const counter = Math.floor(Date.now() / 1_000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(encodedSecret)).update(buffer).digest();
  const finalByte = digest.at(-1);
  if (finalByte === undefined) throw new Error('TOTP digest is empty');
  const offset = finalByte & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

test.describe
  .serial('turnkey local demo', () => {
    test('completes OAuth, uses only the BFF, refreshes, encrypts, and audits', async ({
      page,
      context,
    }) => {
      const access = await demoAccess();
      const browserPayloads: string[] = [];
      page.on('response', async (response) => {
        if (!response.url().includes('/api/example/')) return;
        try {
          browserPayloads.push(await response.text());
        } catch {
          // Navigation or teardown can make a completed response unavailable.
        }
      });

      await page.goto('/demo');
      await expect(page.getByRole('heading', { name: /OAuth, encrypted storage/ })).toBeVisible();
      await page.getByRole('button', { name: 'Connect Demo Provider' }).click();

      const widget = page.frameLocator(
        'iframe[title="Authlane connection for Authlane Demo Provider"]'
      );
      await expect(widget.getByRole('heading', { name: 'Authlane Demo Provider' })).toBeVisible();
      const popupPromise = context.waitForEvent('page');
      await widget.getByRole('button', { name: /Authlane Demo Provider/ }).click();
      const popup = await popupPromise;
      await popup.waitForLoadState('domcontentloaded');
      await expect(popup).toHaveURL(/^http:\/\/localhost:5175\/demo-provider\/authorize\?/);
      await expect(popup.getByText('It never contacts the internet.')).toBeVisible();
      let consentOrigin = 'missing';
      popup.on('request', (request) => {
        if (request.method() === 'POST' && request.url().endsWith('/demo-provider/authorize')) {
          consentOrigin = request.headers().origin ?? 'missing';
        }
      });
      const consentResponsePromise = popup.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().endsWith('/demo-provider/authorize')
      );
      await popup.getByRole('button', { name: 'Allow connection' }).click();
      const consentResponse = await consentResponsePromise;
      expect(consentResponse.status(), `Consent Origin header: ${consentOrigin}`).toBe(302);
      await popup.waitForEvent('close');

      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(page.getByTestId('token-generation')).toHaveText('Token generation 1');
      await expect(page.getByText('Launch checklist')).toBeVisible();

      await expect
        .poll(
          async () => {
            await page.getByRole('button', { name: 'Load resources through BFF' }).click();
            const value = await page.getByTestId('token-generation').textContent();
            return Number(value?.match(/\d+/)?.[0] ?? 0);
          },
          { timeout: 30_000, intervals: [1_000] }
        )
        .toBeGreaterThanOrEqual(2);

      expect(browserPayloads.length).toBeGreaterThan(0);
      const allBrowserPayloads = browserPayloads.join('\n');
      for (const forbidden of [
        'authlane_demo.',
        'access_token',
        'refresh_token',
        access.apiKey,
        'credentialLease',
      ]) {
        expect(allBrowserPayloads).not.toContain(forbidden);
      }
      const browserStorage = await page.evaluate(() => ({
        local: Object.fromEntries(Object.entries(localStorage)),
        session: Object.fromEntries(Object.entries(sessionStorage)),
      }));
      expect(JSON.stringify(browserStorage)).not.toMatch(/token|secret|api.?key/i);

      const sql = postgres(requiredEnvironment('DEMO_ADMIN_DATABASE_URL'), { max: 1 });
      try {
        const runtime = await readFile(requiredEnvironment('AUTHLANE_DEMO_RUNTIME_FILE'), 'utf8');
        const localClientSecret = runtime
          .split('\n')
          .find((line) => line.startsWith('DEMO_OAUTH_CLIENT_SECRET='))
          ?.slice('DEMO_OAUTH_CLIENT_SECRET='.length);
        expect(localClientSecret).toBeTruthy();

        const [secrets] = await sql<
          [{ secret_count: number; leaked_token_marker: boolean; leaked_client_secret: boolean }]
        >`
        select
          count(*)::int as secret_count,
          bool_or(row_to_json(secret_records)::text like '%authlane_demo.%') as leaked_token_marker,
          bool_or(row_to_json(secret_records)::text like ${`%${localClientSecret}%`}) as leaked_client_secret
        from secret_records
        where organization_id = ${access.organizationId}
      `;
        expect(secrets?.secret_count).toBeGreaterThanOrEqual(2);
        expect(secrets?.leaked_token_marker).toBe(false);
        expect(secrets?.leaked_client_secret).toBe(false);

        const [audit] = await sql<[{ count: number }]>`
        select count(*)::int as count
        from credential_access_logs
        where organization_id = ${access.organizationId}
          and external_user_id = ${access.externalUserId}
          and service_id = 'authlane-demo'
      `;
        expect(audit?.count).toBeGreaterThanOrEqual(1);

        const roles = await sql<
          {
            rolname: string;
            rolsuper: boolean;
            rolcreaterole: boolean;
            rolcreatedb: boolean;
            rolbypassrls: boolean;
          }[]
        >`
        select rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls
        from pg_roles where rolname in ('authlane_app', 'authlane_job') order by rolname
      `;
        expect(roles).toEqual([
          {
            rolname: 'authlane_app',
            rolsuper: false,
            rolcreaterole: false,
            rolcreatedb: false,
            rolbypassrls: false,
          },
          {
            rolname: 'authlane_job',
            rolsuper: false,
            rolcreaterole: false,
            rolcreatedb: false,
            rolbypassrls: true,
          },
        ]);
      } finally {
        await sql.end();
      }

      expect((await stat(requiredEnvironment('DEMO_ACCESS_FILE'))).mode & 0o777).toBe(0o600);
      expect((await stat(requiredEnvironment('AUTHLANE_DEMO_RUNTIME_FILE'))).mode & 0o777).toBe(
        0o600
      );
    });

    test('guides an admin through MFA, creates a one-time API key, and revokes it', async ({
      page,
    }) => {
      const access = await demoAccess();
      await page.goto('http://localhost:3000/login');
      await page.getByLabel('Email address').fill(access.adminEmail);
      await page.getByLabel('Password').fill(access.adminPassword);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page).toHaveURL(/\/dashboard/);

      await page.goto('http://localhost:3000/dashboard/security');
      await page.getByLabel('Current password').fill(access.adminPassword);
      await page.getByRole('button', { name: 'Set up two-factor authentication' }).click();
      const totpUri = await page.locator('code').textContent();
      expect(totpUri).toMatch(/^otpauth:\/\/totp\//);
      if (!totpUri) throw new Error('TOTP setup did not return an enrollment URI');
      await page.getByLabel('Authenticator code').fill(await totp(totpUri));
      await page.getByRole('button', { name: 'Verify and enable' }).click();
      await expect(page.getByText(/Two-factor authentication is enabled/)).toBeVisible();
      const totpSecret = new URL(totpUri).searchParams.get('secret');
      expect(totpSecret).toBeTruthy();
      if (!totpSecret) throw new Error('TOTP enrollment URI omitted its secret');

      await page.getByRole('button', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/login/);
      await page.getByLabel('Email address').fill(access.adminEmail);
      await page.getByLabel('Password').fill(access.adminPassword);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page).toHaveURL(/\/two-factor/);
      await page.getByLabel('Authenticator code').fill(await totp(totpUri));
      await page.getByRole('button', { name: 'Verify' }).click();
      await expect(page).toHaveURL(/\/dashboard/);

      await page.goto('http://localhost:3000/dashboard/api-keys');
      await page.getByRole('button', { name: 'Create API Key' }).click();
      await page.getByLabel('API Key Name').fill('Guided demo key');
      await page.getByLabel('Expires In (Days)').fill('1');
      // Scoped to the dialog rather than to the form: the submit button lives in the dialog
      // footer and reaches the form through its `form` attribute, so it is a sibling of the
      // <form> rather than a descendant. The page behind it has a button of the same name.
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Create API Key', exact: true })
        .click();
      await expect(page.getByRole('heading', { name: 'API Key Created' })).toBeVisible();
      const issuedKey = await page
        .getByRole('textbox', { name: 'API Key', exact: true })
        .inputValue();
      expect(issuedKey).toMatch(/^ak_live_/);
      expect(issuedKey).not.toBe(access.apiKey);
      await page.getByRole('button', { name: 'Done' }).click();

      const row = page.getByRole('row').filter({ hasText: 'Guided demo key' });
      await expect(row).toBeVisible();
      await row.getByRole('button', { name: 'Revoke' }).click();
      // Revoking asks in a dialog that names the key rather than through window.confirm(). Accepting
      // a native dialog is no longer what confirms it, and the row hides either way once the dialog
      // covers it — so the database assertions below are what prove the key was actually revoked.
      await page.getByRole('dialog').getByRole('button', { name: 'Revoke key' }).click();
      await expect(row).toBeHidden();

      const sql = postgres(requiredEnvironment('DEMO_ADMIN_DATABASE_URL'), { max: 1 });
      try {
        const [revokedKeys] = await sql<{ total: number; enabled: number }[]>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE enabled)::int AS enabled
        FROM api_keys
        WHERE organization_id = ${access.organizationId}
          AND name = 'Guided demo key'
      `;
        expect(revokedKeys?.total).toBeGreaterThanOrEqual(1);
        expect(revokedKeys?.enabled).toBe(0);

        const [sessionState] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int AS count FROM session WHERE user_id = 'authlane_demo_admin'
      `;
        expect(sessionState?.count).toBe(0);

        const [twoFactorState] = await sql<[{ secret: string; backup_codes: string }]>`
        SELECT secret, backup_codes FROM two_factor WHERE user_id = 'authlane_demo_admin'
      `;
        expect(twoFactorState?.secret).toBeTruthy();
        expect(twoFactorState?.secret).not.toContain(totpSecret);
        expect(twoFactorState?.backup_codes).toBeTruthy();
        expect(twoFactorState?.backup_codes).not.toContain('[');
      } finally {
        await sql.end();
      }
    });
  });
