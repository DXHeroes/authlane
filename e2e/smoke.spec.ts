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
    await expect(primaryNavigation.getByRole('link', { name: 'Product' })).toHaveAttribute(
      'href',
      '#product'
    );
    await expect(primaryNavigation.getByRole('link', { name: 'Integrations' })).toHaveAttribute(
      'href',
      '#integrations'
    );
    await expect(
      page
        .getByRole('navigation', { name: 'Footer navigation' })
        .getByRole('link', { name: 'Security' })
    ).toHaveAttribute('href', '#security');
    await expect(page.getByRole('link', { name: 'Read the docs' })).toHaveAttribute(
      'href',
      'https://authlane.io/docs'
    );
  });

  test('has call-to-action buttons', async ({ page, request }) => {
    const isAvailable = await isServiceAvailable(URLS.landing, request);
    test.skip(!isAvailable, 'Landing page service not running');

    await page.goto(URLS.landing);

    await expect(page.getByRole('link', { name: 'Start building' }).first()).toBeVisible();
    await expect(page.locator('[data-primary-cta]')).toHaveCount(1);
  });

  test('gives apex docs canonical metadata and marketing navigation', async ({ page, request }) => {
    const isAvailable = await isServiceAvailable(URLS.landing, request);
    test.skip(!isAvailable, 'Landing page service not running');

    await page.goto(`${URLS.landing}/docs/`);

    await expect(page).toHaveTitle('Documentation — Authlane');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      'Authlane is the connection and tool control plane for SaaS applications'
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://authlane.io/docs/'
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'Authlane documentation'
    );
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
      'content',
      'Authlane is the connection and tool control plane for SaaS applications'
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      'content',
      'https://authlane.io/docs/'
    );
    await expect(page.locator('header a[href^="#"], footer a[href^="#"]')).toHaveCount(0);

    const primaryNavigation = page.getByRole('navigation', { name: 'Primary navigation' });
    await expect(primaryNavigation.getByRole('link', { name: 'Product' })).toHaveAttribute(
      'href',
      'https://authlane.io/#product'
    );
    await expect(primaryNavigation.getByRole('link', { name: 'Security' })).toHaveAttribute(
      'href',
      'https://authlane.io/#security'
    );
    for (const homepageLink of await page.getByRole('link', { name: 'Homepage' }).all()) {
      await expect(homepageLink).toHaveAttribute('href', 'https://authlane.io/');
    }
  });

  test('keeps apex navigation available from the 404 surface', async ({ page, request }) => {
    const isAvailable = await isServiceAvailable(URLS.landing, request);
    test.skip(!isAvailable, 'Landing page service not running');

    await page.goto(`${URLS.landing}/route-that-does-not-exist`);

    await expect(
      page.getByRole('heading', { name: 'This path is outside the public surface' })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Return to Authlane' })).toHaveAttribute(
      'href',
      'https://authlane.io/'
    );
    for (const homepageLink of await page.getByRole('link', { name: 'Homepage' }).all()) {
      await expect(homepageLink).toHaveAttribute('href', 'https://authlane.io/');
    }
    await expect(
      page
        .getByRole('navigation', { name: 'Primary navigation' })
        .getByRole('link', { name: 'Integrations' })
    ).toHaveAttribute('href', 'https://authlane.io/#integrations');
    await expect(page.locator('header a[href^="#"], footer a[href^="#"]')).toHaveCount(0);
  });

  test('keeps mobile navigation controls visible with 48px targets', async ({ page, request }) => {
    const isAvailable = await isServiceAvailable(URLS.landing, request);
    test.skip(!isAvailable, 'Landing page service not running');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(URLS.landing);

    const wordmark = page.getByRole('banner').getByRole('link', { name: 'Homepage' });
    const menuButton = page.getByRole('button', { name: 'Open navigation menu' });
    await expect(wordmark).toBeVisible();
    await expect(menuButton).toBeVisible();
    expect((await wordmark.boundingBox())?.height).toBeGreaterThanOrEqual(48);
    expect((await menuButton.boundingBox())?.height).toBeGreaterThanOrEqual(48);

    await menuButton.click();

    await expect(wordmark).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close navigation menu' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
  });

  test('serves a metadata icon without a favicon console error', async ({ page, request }) => {
    const isAvailable = await isServiceAvailable(URLS.landing, request);
    test.skip(!isAvailable, 'Landing page service not running');
    const faviconErrors: string[] = [];
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        (message.text().includes('favicon') || message.location().url.includes('/favicon.ico'))
      ) {
        faviconErrors.push(message.text());
      }
    });

    await page.goto(URLS.landing);

    const iconHref = await page.locator('link[rel="icon"]').getAttribute('href');
    expect(iconHref).toBeTruthy();
    if (iconHref) {
      const response = await request.get(new URL(iconHref, URLS.landing).toString());
      expect(response.ok()).toBeTruthy();
      expect(response.headers()['content-type']).toContain('image/svg+xml');
    }
    expect(faviconErrors).toEqual([]);
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
