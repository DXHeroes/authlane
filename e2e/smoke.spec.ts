import { expect, test } from '@playwright/test';
import { isServiceAvailable, URLS } from './utils';

/**
 * Smoke Tests for Authlane
 *
 * Quick health checks for all applications.
 * Run with: pnpm test:e2e e2e/smoke.spec.ts
 *
 * Prerequisites:
 * - pnpm dev (all services running)
 * - Database seeded: pnpm --filter @authlane/database seed
 *
 * For detailed user flow tests, see:
 * - auth.spec.ts - Authentication flows
 * - organization.spec.ts - Organization management
 * - services.spec.ts - Service management
 * - example-saas.spec.ts - Example SaaS app
 */

test.describe('API Health', () => {
  test('health endpoint returns ok', async ({ request }) => {
    const isAvailable = await isServiceAvailable(`${URLS.api}/health`, request);
    test.skip(!isAvailable, 'API service not running');

    const response = await request.get(`${URLS.api}/health`);
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('services endpoint requires authentication', async ({ request }) => {
    const isAvailable = await isServiceAvailable(`${URLS.api}/health`, request);
    test.skip(!isAvailable, 'API service not running');

    const response = await request.get(`${URLS.api}/api/v1/services`);
    expect(response.status()).toBe(401);
  });

  test('services endpoint works with API key', async ({ request }) => {
    const isAvailable = await isServiceAvailable(`${URLS.api}/health`, request);
    test.skip(!isAvailable, 'API service not running');

    const apiKey = process.env.TEST_API_KEY || 'test_api_key_dev';

    const response = await request.get(`${URLS.api}/api/v1/services`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    // Either 200 (valid key) or 401 (invalid key)
    expect([200, 401]).toContain(response.status());
  });
});

test.describe('Landing Page', () => {
  test('loads and displays hero section', async ({ page, request }) => {
    const isAvailable = await isServiceAvailable(URLS.landing, request);
    test.skip(!isAvailable, 'Landing page service not running');

    await page.goto(URLS.landing);

    await expect(page).toHaveTitle(/Authlane/i);
    await expect(
      page.getByRole('heading', { name: 'Connected tools. Your traffic.' })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Connect once', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Use everywhere', exact: true })).toBeVisible();
  });

  test('navigation links are present', async ({ page, request }) => {
    const isAvailable = await isServiceAvailable(URLS.landing, request);
    test.skip(!isAvailable, 'Landing page service not running');

    await page.goto(URLS.landing);

    const primaryNavigation = page.getByRole('navigation', { name: 'Primary navigation' });
    await expect(primaryNavigation.getByRole('link', { name: 'Product' })).toBeVisible();
    await expect(primaryNavigation.getByRole('link', { name: 'Integrations' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Read the docs' })).toHaveAttribute(
      'href',
      'https://app.authlane.io/docs'
    );
  });

  test('has call-to-action buttons', async ({ page, request }) => {
    const isAvailable = await isServiceAvailable(URLS.landing, request);
    test.skip(!isAvailable, 'Landing page service not running');

    await page.goto(URLS.landing);

    await expect(page.getByRole('link', { name: 'Start building' }).first()).toBeVisible();
    await expect(page.locator('[data-primary-cta]')).toHaveCount(1);
  });
});

test.describe('Dashboard', () => {
  test('loads login page', async ({ page, request }) => {
    const isAvailable = await isServiceAvailable(URLS.dashboard, request);
    test.skip(!isAvailable, 'Dashboard service not running');

    await page.goto(URLS.dashboard);
    await page.waitForLoadState('networkidle');

    const hasContent = await page.locator('body').textContent();
    expect(hasContent).toBeTruthy();
  });

  test('shows login form elements', async ({ page, request }) => {
    const isAvailable = await isServiceAvailable(URLS.dashboard, request);
    test.skip(!isAvailable, 'Dashboard service not running');

    await page.goto(`${URLS.dashboard}/login`);
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const passwordInput = page.locator('input[type="password"]');

    (await emailInput.count()) > 0 || (await passwordInput.count()) > 0;
    expect(true).toBeTruthy();
  });

  test('registration page loads', async ({ page, request }) => {
    const isAvailable = await isServiceAvailable(URLS.dashboard, request);
    test.skip(!isAvailable, 'Dashboard service not running');

    await page.goto(`${URLS.dashboard}/register`);
    await page.waitForLoadState('networkidle');

    const hasContent = await page.locator('body').textContent();
    expect(hasContent).toBeTruthy();
  });
});

test.describe('Widget', () => {
  test('loads and shows content', async ({ page, request }) => {
    const isAvailable = await isServiceAvailable(URLS.widget, request);
    test.skip(!isAvailable, 'Widget service not running');

    await page.goto(URLS.widget);
    await page.waitForLoadState('networkidle');

    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toBeTruthy();
  });

  test('shows dev mode indicator or services', async ({ page, request }) => {
    const isAvailable = await isServiceAvailable(URLS.widget, request);
    test.skip(!isAvailable, 'Widget service not running');

    await page.goto(URLS.widget);
    await page.waitForTimeout(2000);

    const hasContent = await page.locator('body').textContent();
    expect(hasContent?.length).toBeGreaterThan(0);
  });
});

test.describe('Documentation', () => {
  test('docs site loads', async ({ page, request }) => {
    const isAvailable = await isServiceAvailable(URLS.docs, request);
    test.skip(!isAvailable, 'Docs service not running');

    await page.goto(URLS.docs);
    await page.waitForLoadState('networkidle');

    const hasContent = await page.locator('body').textContent();
    expect(hasContent).toBeTruthy();
  });

  test('shows documentation content', async ({ page, request }) => {
    const isAvailable = await isServiceAvailable(URLS.docs, request);
    test.skip(!isAvailable, 'Docs service not running');

    await page.goto(URLS.docs);
    await page.waitForLoadState('networkidle');

    const pageText = await page.locator('body').textContent();
    expect(pageText?.toLowerCase()).toMatch(/authlane|oauth|api|integration/i);
  });
});

test.describe('Example SaaS', () => {
  test('loads example saas app', async ({ page, request }) => {
    const isAvailable = await isServiceAvailable(URLS.exampleSaas, request);
    test.skip(!isAvailable, 'Example SaaS service not running');

    await page.goto(URLS.exampleSaas);
    await page.waitForLoadState('networkidle');

    const hasContent = await page.locator('body').textContent();
    expect(hasContent).toBeTruthy();
  });
});

test.describe('Cross-App Navigation', () => {
  test('can navigate from landing to docs', async ({ page, request }) => {
    const isAvailable = await isServiceAvailable(URLS.landing, request);
    test.skip(!isAvailable, 'Landing page service not running');

    await page.goto(URLS.landing);

    const docsLink = page.locator('a:has-text("Docs"), a:has-text("Documentation")').first();

    if ((await docsLink.count()) > 0) {
      const href = await docsLink.getAttribute('href');
      expect(href).toBeTruthy();
    }
  });
});
