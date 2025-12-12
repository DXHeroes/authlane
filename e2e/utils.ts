import { Page, expect } from '@playwright/test'

/**
 * Test Utilities for Authlane E2E Tests
 */

// URLs for different apps
export const URLS = {
  dashboard: 'http://localhost:5173',
  api: 'http://localhost:3000',
  landing: 'http://localhost:3002',
  widget: 'http://localhost:3003',
  docs: 'http://localhost:3004',
  exampleSaas: 'http://localhost:5174',
}

/**
 * Generate unique test user credentials
 */
export function generateTestUser() {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(7)
  return {
    name: `Test User ${random}`,
    email: `test-${timestamp}-${random}@example.com`,
    password: `TestPassword123!${random}`,
  }
}

/**
 * Register a new user and login
 */
export async function registerAndLogin(page: Page, user?: ReturnType<typeof generateTestUser>) {
  const testUser = user || generateTestUser()

  // Go to registration page
  await page.goto(`${URLS.dashboard}/register`)
  await page.waitForLoadState('networkidle')

  // Fill registration form
  await page.fill('input[name="name"], input[placeholder*="name" i]', testUser.name)
  await page.fill('input[name="email"], input[type="email"]', testUser.email)
  await page.fill('input[name="password"], input[type="password"]', testUser.password)

  // Submit form
  await page.click('button[type="submit"]')

  // Wait for redirect to dashboard
  await page.waitForURL(/\/dashboard/, { timeout: 10000 })

  return testUser
}

/**
 * Login with existing credentials
 */
export async function login(page: Page, email: string, password: string) {
  await page.goto(`${URLS.dashboard}/login`)
  await page.waitForLoadState('networkidle')

  // Fill login form
  await page.fill('input[name="email"], input[type="email"]', email)
  await page.fill('input[name="password"], input[type="password"]', password)

  // Submit form
  await page.click('button[type="submit"]')

  // Wait for redirect to dashboard
  await page.waitForURL(/\/dashboard/, { timeout: 10000 })
}

/**
 * Logout current user
 */
export async function logout(page: Page) {
  // Click logout button or user menu
  const logoutButton = page.locator('button:has-text("Logout"), button:has-text("Sign out"), [aria-label="Logout"]')
  
  if (await logoutButton.count() > 0) {
    await logoutButton.first().click()
  } else {
    // Try clicking user menu first
    const userMenu = page.locator('[data-testid="user-menu"], button:has-text("User")')
    if (await userMenu.count() > 0) {
      await userMenu.first().click()
      await page.click('text=Logout')
    }
  }

  // Wait for redirect to login
  await page.waitForURL(/\/(login|$)/, { timeout: 5000 })
}

/**
 * Wait for dashboard to fully load
 */
export async function waitForDashboard(page: Page) {
  await page.waitForLoadState('networkidle')
  
  // Wait for either dashboard content or loading to disappear
  await Promise.race([
    page.waitForSelector('[data-testid="dashboard"], .dashboard, main', { timeout: 10000 }),
    page.waitForSelector('text=Services', { timeout: 10000 }),
    page.waitForSelector('text=Dashboard', { timeout: 10000 }),
  ]).catch(() => {
    // If none found, just wait for network idle
  })
}

/**
 * Navigate to services page
 */
export async function navigateToServices(page: Page) {
  await page.click('a[href*="services"], text=Services')
  await page.waitForLoadState('networkidle')
}

/**
 * Navigate to organization settings
 */
export async function navigateToOrganization(page: Page) {
  await page.click('a[href*="organization"], text=Organization')
  await page.waitForLoadState('networkidle')
}

/**
 * Navigate to members page
 */
export async function navigateToMembers(page: Page) {
  await page.click('a[href*="members"], text=Members')
  await page.waitForLoadState('networkidle')
}

/**
 * Check if user is logged in
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  // Check for presence of logout button or user menu
  const indicators = await Promise.all([
    page.locator('button:has-text("Logout")').count(),
    page.locator('[data-testid="user-menu"]').count(),
    page.locator('text=Dashboard').count(),
  ])
  
  return indicators.some(count => count > 0)
}

/**
 * Get current organization name
 */
export async function getCurrentOrganization(page: Page): Promise<string | null> {
  const orgSelector = page.locator('[data-testid="org-selector"], .org-selector')
  if (await orgSelector.count() > 0) {
    return await orgSelector.textContent()
  }
  return null
}

/**
 * Create a new organization
 */
export async function createOrganization(page: Page, name: string) {
  // Click organization selector or add button
  await page.click('[data-testid="org-selector"], .org-selector, button:has-text("Create Organization")')
  
  // Click "New Organization" option if dropdown
  const newOrgOption = page.locator('text=New Organization, text=Create Organization')
  if (await newOrgOption.count() > 0) {
    await newOrgOption.first().click()
  }

  // Fill organization name
  await page.fill('input[name="name"], input[placeholder*="organization" i]', name)

  // Submit
  await page.click('button[type="submit"], button:has-text("Create")')

  // Wait for organization to be created
  await page.waitForLoadState('networkidle')
}

/**
 * Assert toast/notification message
 */
export async function expectToast(page: Page, message: string | RegExp) {
  await expect(page.locator('.toast, [role="alert"], .notification').filter({ hasText: message })).toBeVisible({
    timeout: 5000,
  })
}

/**
 * Clear all test data (if possible via API)
 */
export async function clearTestData(page: Page) {
  // This would typically call an API endpoint to clean up test data
  // For now, we just log out if logged in
  if (await isLoggedIn(page)) {
    await logout(page)
  }
}








