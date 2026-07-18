import { expect, test } from '@playwright/test';
import { generateTestUser, isServiceAvailable, URLS, waitForDashboard } from './utils';

/**
 * Authentication E2E Tests
 *
 * Tests critical authentication flows:
 * - User registration
 * - User login
 * - Auto-organization creation
 * - Logout
 * - Invalid credentials handling
 */

test.describe('Authentication', () => {
  test.describe('Registration', () => {
    test('can register a new user', async ({ page, request }) => {
      const isAvailable = await isServiceAvailable(URLS.dashboard, request);
      test.skip(!isAvailable, 'Dashboard service not running');

      const user = generateTestUser();

      await page.goto(`${URLS.dashboard}/register`);
      await page.waitForLoadState('networkidle');

      // Fill registration form
      await page.fill('input[name="name"]', user.name);
      await page.fill('input[type="email"]', user.email);
      await page.fill('input[type="password"]', user.password);

      // Submit
      await page.click('button[type="submit"]');

      // Should redirect to dashboard
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    });

    test('creates default organization after registration', async ({ page, request }) => {
      const isAvailable = await isServiceAvailable(URLS.dashboard, request);
      test.skip(!isAvailable, 'Dashboard service not running');

      const user = generateTestUser();

      await page.goto(`${URLS.dashboard}/register`);
      await page.waitForLoadState('networkidle');

      // Register
      await page.fill('input[name="name"]', user.name);
      await page.fill('input[type="email"]', user.email);
      await page.fill('input[type="password"]', user.password);
      await page.click('button[type="submit"]');

      // Wait for dashboard
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
      await waitForDashboard(page);

      // Organization should be visible (either in header or sidebar)
      const orgIndicator = page
        .locator(`text=${user.name}`)
        .or(page.locator('[data-testid="org-selector"]'))
        .or(page.locator('.org-name, .organization-name'));

      await expect(orgIndicator.first()).toBeVisible({ timeout: 5000 });
    });

    test('shows error for duplicate email', async ({ page, request }) => {
      const isAvailable = await isServiceAvailable(URLS.dashboard, request);
      test.skip(!isAvailable, 'Dashboard service not running');

      const user = generateTestUser();

      // Register first time
      await page.goto(`${URLS.dashboard}/register`);
      await page.fill('input[name="name"]', user.name);
      await page.fill('input[type="email"]', user.email);
      await page.fill('input[type="password"]', user.password);
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

      // Logout and try to register again with same email
      await page.goto(`${URLS.dashboard}/register`);
      await page.fill('input[name="name"]', 'Another User');
      await page.fill('input[type="email"]', user.email);
      await page.fill('input[type="password"]', 'AnotherPassword123!');
      await page.click('button[type="submit"]');

      // Should show error
      await expect(
        page
          .locator('text=/already|exists|taken/i')
          .or(page.locator('[role="alert"]'))
          .or(page.locator('.error'))
      ).toBeVisible({ timeout: 5000 });
    });

    test('validates required fields', async ({ page, request }) => {
      const isAvailable = await isServiceAvailable(URLS.dashboard, request);
      test.skip(!isAvailable, 'Dashboard service not running');

      await page.goto(`${URLS.dashboard}/register`);
      await page.waitForLoadState('networkidle');

      // Try to submit empty form
      await page.click('button[type="submit"]');

      // Should still be on register page
      await expect(page).toHaveURL(/register/);
    });
  });

  test.describe('Login', () => {
    test('can login with valid credentials', async ({ page, request }) => {
      const isAvailable = await isServiceAvailable(URLS.dashboard, request);
      test.skip(!isAvailable, 'Dashboard service not running');

      // First register a user
      const user = generateTestUser();
      await page.goto(`${URLS.dashboard}/register`);
      await page.fill('input[name="name"]', user.name);
      await page.fill('input[type="email"]', user.email);
      await page.fill('input[type="password"]', user.password);
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

      // Logout
      await page.goto(`${URLS.dashboard}/login`);

      // Login
      await page.fill('input[type="email"]', user.email);
      await page.fill('input[type="password"]', user.password);
      await page.click('button[type="submit"]');

      // Should be on dashboard
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    });

    test('shows error for invalid credentials', async ({ page, request }) => {
      const isAvailable = await isServiceAvailable(URLS.dashboard, request);
      test.skip(!isAvailable, 'Dashboard service not running');

      await page.goto(`${URLS.dashboard}/login`);
      await page.waitForLoadState('networkidle');

      // Try to login with non-existent email
      await page.fill('input[type="email"]', 'nonexistent@example.com');
      await page.fill('input[type="password"]', 'WrongPassword123!');
      await page.click('button[type="submit"]');

      // Should show error
      await expect(
        page
          .locator('text=/invalid|incorrect|failed|error/i')
          .or(page.locator('[role="alert"]'))
          .or(page.locator('.error'))
      ).toBeVisible({ timeout: 5000 });

      // Should still be on login page
      await expect(page).toHaveURL(/login/);
    });

    test('shows error for wrong password', async ({ page, request }) => {
      const isAvailable = await isServiceAvailable(URLS.dashboard, request);
      test.skip(!isAvailable, 'Dashboard service not running');

      // First register a user
      const user = generateTestUser();
      await page.goto(`${URLS.dashboard}/register`);
      await page.fill('input[name="name"]', user.name);
      await page.fill('input[type="email"]', user.email);
      await page.fill('input[type="password"]', user.password);
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

      // Go to login and try wrong password
      await page.goto(`${URLS.dashboard}/login`);
      await page.fill('input[type="email"]', user.email);
      await page.fill('input[type="password"]', 'WrongPassword!');
      await page.click('button[type="submit"]');

      // Should show error
      await expect(
        page
          .locator('text=/invalid|incorrect|failed|error/i')
          .or(page.locator('[role="alert"]'))
          .or(page.locator('.error'))
      ).toBeVisible({ timeout: 5000 });
    });

    test('can navigate to registration from login', async ({ page, request }) => {
      const isAvailable = await isServiceAvailable(URLS.dashboard, request);
      test.skip(!isAvailable, 'Dashboard service not running');

      await page.goto(`${URLS.dashboard}/login`);
      await page.waitForLoadState('networkidle');

      // Click register link
      await page.click('a[href*="register"], text=Register, text=Sign up, text=Create account');

      await expect(page).toHaveURL(/register/);
    });
  });

  test.describe('Logout', () => {
    test('can logout from dashboard', async ({ page, request }) => {
      const isAvailable = await isServiceAvailable(URLS.dashboard, request);
      test.skip(!isAvailable, 'Dashboard service not running');

      // Register and login
      const user = generateTestUser();
      await page.goto(`${URLS.dashboard}/register`);
      await page.fill('input[name="name"]', user.name);
      await page.fill('input[type="email"]', user.email);
      await page.fill('input[type="password"]', user.password);
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
      await waitForDashboard(page);

      // Find and click logout
      const logoutButton = page.locator('button:has-text("Logout"), button:has-text("Sign out")');
      await logoutButton.click();

      // Should redirect to login
      await expect(page).toHaveURL(/\/(login)?$/, { timeout: 5000 });
    });
  });

  test.describe('Protected Routes', () => {
    test('redirects to login when accessing dashboard without auth', async ({ page, request }) => {
      const isAvailable = await isServiceAvailable(URLS.dashboard, request);
      test.skip(!isAvailable, 'Dashboard service not running');

      await page.goto(`${URLS.dashboard}/dashboard`);

      // Should redirect to login
      await expect(page).toHaveURL(/login/, { timeout: 5000 });
    });

    test('redirects to login when accessing services without auth', async ({ page, request }) => {
      const isAvailable = await isServiceAvailable(URLS.dashboard, request);
      test.skip(!isAvailable, 'Dashboard service not running');

      await page.goto(`${URLS.dashboard}/dashboard/services`);

      // Should redirect to login
      await expect(page).toHaveURL(/login/, { timeout: 5000 });
    });
  });
});
