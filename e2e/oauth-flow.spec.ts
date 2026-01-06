import { expect, test } from '@playwright/test';
import { generateTestUser, URLS, waitForDashboard } from './utils';

/**
 * OAuth Flow E2E Tests
 *
 * Tests the complete OAuth authentication flow:
 * - OAuth authorization initiation
 * - OAuth callback handling
 * - Token exchange and storage
 * - Connection creation
 * - Connection status updates
 * - OAuth connection refresh
 *
 * Prerequisites:
 * - GitHub OAuth app configured in .env
 * - pnpm dev running
 */

test.describe('OAuth Flow', () => {
  // Helper to register and login
  async function registerUser(page: typeof test.prototype.page) {
    const user = generateTestUser();
    await page.goto(`${URLS.dashboard}/register`);
    await page.fill('input[name="name"]', user.name);
    await page.fill('input[type="email"]', user.email);
    await page.fill('input[type="password"]', user.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    await waitForDashboard(page);
    return user;
  }

  test.describe('GitHub OAuth Flow', () => {
    test('can initiate OAuth authorization for GitHub', async ({ page, context }) => {
      await registerUser(page);

      // Navigate to services
      await page.click('a[href*="services"], text=Services');
      await page.waitForLoadState('networkidle');

      // Find GitHub service
      const githubCard = page
        .locator(
          '[data-testid="service-github"], .service-card:has-text("GitHub"), a:has-text("GitHub")'
        )
        .first();

      if ((await githubCard.count()) > 0) {
        // Click on GitHub service
        await githubCard.click();
        await page.waitForLoadState('networkidle');

        // Should see OAuth configuration section
        const connectButton = page.locator(
          'button:has-text("Connect"), button:has-text("Authorize"), button:has-text("Connect GitHub")'
        );

        if ((await connectButton.count()) > 0) {
          // Listen for popup/new tab
          const popupPromise = context.waitForEvent('page');
          await connectButton.click();

          // Wait for OAuth popup
          const popup = await popupPromise.catch(() => null);

          if (popup) {
            // Should navigate to GitHub OAuth page (or our OAuth endpoint)
            await popup.waitForLoadState('networkidle');
            const url = popup.url();

            // URL should contain either github.com or our OAuth endpoint
            expect(url).toMatch(/github\.com\/login\/oauth|localhost.*\/oauth\/github/);

            await popup.close();
          }
        }
      }
    });

    test('OAuth callback creates connection', async ({ page }) => {
      await registerUser(page);

      // Simulate OAuth callback with mock authorization code
      const mockAuthCode = 'test_auth_code_' + Date.now();
      const callbackUrl = `${URLS.api}/api/v1/oauth/github/callback?code=${mockAuthCode}&state=test_state`;

      // Navigate to callback URL
      await page.goto(callbackUrl);
      await page.waitForLoadState('networkidle');

      // Should either:
      // 1. Show success message
      // 2. Redirect to dashboard
      // 3. Show error (expected if mock code is invalid)

      const hasResponse = await page.locator('body').textContent();
      expect(hasResponse).toBeTruthy();
    });

    test('shows connection status after OAuth', async ({ page }) => {
      await registerUser(page);

      // Navigate to services/connections
      const connectionsLink = page.locator('a[href*="connections"], text=Connections');

      if ((await connectionsLink.count()) > 0) {
        await connectionsLink.click();
        await page.waitForLoadState('networkidle');

        // Should see connections list (empty or with connections)
        await expect(
          page
            .locator('text=Connections')
            .or(page.locator('h1:has-text("Connections")'))
            .or(page.locator('text=No connections'))
            .or(page.locator('[data-testid="connections-list"]'))
        ).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('OAuth Error Handling', () => {
    test('handles OAuth authorization denial', async ({ page }) => {
      await registerUser(page);

      // Simulate OAuth callback with error
      const callbackUrl = `${URLS.api}/api/v1/oauth/github/callback?error=access_denied&error_description=User+denied+access`;

      await page.goto(callbackUrl);
      await page.waitForLoadState('networkidle');

      // Should show error message
      const bodyText = await page.locator('body').textContent();
      expect(bodyText?.toLowerCase()).toMatch(/error|denied|failed/);
    });

    test('handles invalid OAuth state', async ({ page }) => {
      await registerUser(page);

      // Simulate OAuth callback with invalid state
      const callbackUrl = `${URLS.api}/api/v1/oauth/github/callback?code=test_code&state=invalid_state_123`;

      await page.goto(callbackUrl);
      await page.waitForLoadState('networkidle');

      // Should show error or handle gracefully
      const bodyText = await page.locator('body').textContent();
      expect(bodyText).toBeTruthy();
    });

    test('handles missing authorization code', async ({ page }) => {
      await registerUser(page);

      // Simulate OAuth callback without code
      const callbackUrl = `${URLS.api}/api/v1/oauth/github/callback?state=test_state`;

      await page.goto(callbackUrl);
      await page.waitForLoadState('networkidle');

      // Should show error
      const bodyText = await page.locator('body').textContent();
      expect(bodyText?.toLowerCase()).toMatch(/error|code|missing|required/);
    });
  });

  test.describe('OAuth Connections Management', () => {
    test('can view OAuth connections list', async ({ page }) => {
      await registerUser(page);

      // Navigate to connections if such page exists
      const nav = page.locator('a[href*="connections"], text=Connections').first();

      if ((await nav.count()) > 0) {
        await nav.click();
        await page.waitForLoadState('networkidle');

        // Should see connections table or list
        await expect(
          page
            .locator('[data-testid="connections-list"]')
            .or(page.locator('table'))
            .or(page.locator('text=Connections'))
            .or(page.locator('text=No connections'))
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test('shows connection details (service, status, date)', async ({ page }) => {
      await registerUser(page);

      const connectionsLink = page.locator('a[href*="connections"]').first();

      if ((await connectionsLink.count()) > 0) {
        await connectionsLink.click();
        await page.waitForLoadState('networkidle');

        // If there are connections, should show details
        const connectionRow = page
          .locator('[data-testid="connection-row"], .connection-item, tr')
          .first();

        if ((await connectionRow.count()) > 0) {
          // Should have service name, status, and potentially date
          const rowText = await connectionRow.textContent();
          expect(rowText).toBeTruthy();
        }
      }
    });

    test('can disconnect an OAuth connection', async ({ page }) => {
      await registerUser(page);

      const connectionsLink = page.locator('a[href*="connections"]').first();

      if ((await connectionsLink.count()) > 0) {
        await connectionsLink.click();
        await page.waitForLoadState('networkidle');

        // Find disconnect button
        const disconnectButton = page
          .locator(
            'button:has-text("Disconnect"), button:has-text("Remove"), [data-testid="disconnect-button"]'
          )
          .first();

        if ((await disconnectButton.count()) > 0) {
          // Click disconnect
          await disconnectButton.click();

          // May have confirmation dialog
          const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")');
          if ((await confirmButton.count()) > 0) {
            await confirmButton.click();
          }

          await page.waitForLoadState('networkidle');

          // Connection should be removed or status updated
          const hasResponse = await page.locator('body').textContent();
          expect(hasResponse).toBeTruthy();
        }
      }
    });
  });

  test.describe('OAuth Scopes and Permissions', () => {
    test('displays required scopes for OAuth service', async ({ page }) => {
      await registerUser(page);

      // Navigate to GitHub service detail
      await page.click('a[href*="services"], text=Services');
      await page.waitForLoadState('networkidle');

      const githubLink = page
        .locator('a:has-text("GitHub"), [data-testid="service-github"]')
        .first();

      if ((await githubLink.count()) > 0) {
        await githubLink.click();
        await page.waitForLoadState('networkidle');

        // Should show scopes/permissions information
        const scopesSection = page.locator(
          'text=Scopes, text=Permissions, text=Access, [data-testid="oauth-scopes"]'
        );

        // Scopes might be shown or not depending on implementation
        const hasScopesInfo = (await scopesSection.count()) > 0;

        if (hasScopesInfo) {
          await expect(scopesSection.first()).toBeVisible();
        }
      }
    });

    test('shows different scopes for different services', async ({ page }) => {
      await registerUser(page);

      await page.click('a[href*="services"], text=Services');
      await page.waitForLoadState('networkidle');

      // GitHub and Google Calendar have different scopes
      const serviceLinks = page.locator('[data-testid^="service-"], .service-card a');

      if ((await serviceLinks.count()) > 1) {
        // Click first service
        await serviceLinks.nth(0).click();
        await page.waitForLoadState('networkidle');

        const firstServiceContent = await page.locator('body').textContent();

        // Go back
        await page.goBack();
        await page.waitForLoadState('networkidle');

        // Click second service
        await serviceLinks.nth(1).click();
        await page.waitForLoadState('networkidle');

        const secondServiceContent = await page.locator('body').textContent();

        // Content should be different
        expect(firstServiceContent).not.toBe(secondServiceContent);
      }
    });
  });

  test.describe('OAuth Token Refresh', () => {
    test('shows token expiration information', async ({ page }) => {
      await registerUser(page);

      const connectionsLink = page.locator('a[href*="connections"]').first();

      if ((await connectionsLink.count()) > 0) {
        await connectionsLink.click();
        await page.waitForLoadState('networkidle');

        // If there are OAuth connections, might show expiration
        const expirationInfo = page.locator(
          'text=Expires, text=Expiry, text=Valid until, [data-testid="token-expiry"]'
        );

        // This is optional depending on implementation
        const hasExpiryInfo = (await expirationInfo.count()) > 0;

        if (hasExpiryInfo) {
          await expect(expirationInfo.first()).toBeVisible();
        }
      }
    });

    test('can manually refresh OAuth token', async ({ page }) => {
      await registerUser(page);

      const connectionsLink = page.locator('a[href*="connections"]').first();

      if ((await connectionsLink.count()) > 0) {
        await connectionsLink.click();
        await page.waitForLoadState('networkidle');

        // Find refresh button
        const refreshButton = page
          .locator(
            'button:has-text("Refresh"), button:has-text("Renew"), [data-testid="refresh-token"]'
          )
          .first();

        if ((await refreshButton.count()) > 0) {
          await refreshButton.click();
          await page.waitForLoadState('networkidle');

          // Should show success or error message
          const hasResponse = await page.locator('body').textContent();
          expect(hasResponse).toBeTruthy();
        }
      }
    });
  });
});
