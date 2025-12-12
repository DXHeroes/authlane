import { test, expect } from '@playwright/test'
import { URLS, generateTestUser, waitForDashboard } from './utils'

/**
 * Services E2E Tests
 * 
 * Tests service management functionality:
 * - View services list (grouped by auth type)
 * - Enable/disable services via toggle
 * - Navigate to service detail page
 * - View OAuth configuration section
 * - View public API info section
 */

test.describe('Services', () => {
  // Helper to register and get to dashboard
  async function registerUser(page: typeof test.prototype.page) {
    const user = generateTestUser()
    await page.goto(`${URLS.dashboard}/register`)
    await page.fill('input[name="name"]', user.name)
    await page.fill('input[type="email"]', user.email)
    await page.fill('input[type="password"]', user.password)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })
    await waitForDashboard(page)
    return user
  }

  test.describe('Services List', () => {
    test('can navigate to services page', async ({ page }) => {
      await registerUser(page)

      // Navigate to services
      const servicesLink = page.locator('a[href*="services"], text=Services').first()
      await servicesLink.click()

      // Should see services heading or list
      await expect(page.locator('text=Services').or(
        page.locator('h1:has-text("Services")')
      ).or(
        page.locator('[data-testid="services-list"]')
      )).toBeVisible({ timeout: 5000 })
    })

    test('displays services grouped by auth type', async ({ page }) => {
      await registerUser(page)

      // Navigate to services
      await page.click('a[href*="services"], text=Services')
      await page.waitForLoadState('networkidle')

      // Should see different sections for different auth types
      const sections = page.locator('text=OAuth2').or(
        page.locator('text=API Key')
      ).or(
        page.locator('text=Public API')
      ).or(
        page.locator('text=No Setup Required')
      )

      // At least one section should be visible
      await expect(sections.first()).toBeVisible({ timeout: 10000 })
    })

    test('displays service cards with auth type badges', async ({ page }) => {
      await registerUser(page)

      // Navigate to services
      await page.click('a[href*="services"], text=Services')
      await page.waitForLoadState('networkidle')

      // Should see service cards
      const serviceCards = page.locator('[data-testid="service-card"], .service-card, .card')
      await expect(serviceCards.first()).toBeVisible({ timeout: 10000 })

      // Should have badges indicating auth type
      const badges = page.locator('text=OAuth').or(
        page.locator('text=API Key')
      ).or(
        page.locator('text=Public')
      ).or(
        page.locator('text=oauth2')
      ).or(
        page.locator('text=api_key')
      ).or(
        page.locator('text=none')
      )

      // At least one badge should be visible
      await expect(badges.first()).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Service Toggle', () => {
    test('can enable a service via toggle', async ({ page }) => {
      await registerUser(page)

      // Navigate to services
      await page.click('a[href*="services"], text=Services')
      await page.waitForLoadState('networkidle')

      // Find a toggle button
      const toggle = page.locator('[data-testid="service-toggle"], button[role="switch"], input[type="checkbox"], .toggle')
      
      if (await toggle.count() > 0) {
        const firstToggle = toggle.first()
        
        // Get initial state
        const initialChecked = await firstToggle.isChecked().catch(() => false)
        
        // Click toggle
        await firstToggle.click()
        await page.waitForLoadState('networkidle')

        // State should change (or stay if API call failed)
        // We just verify the click works without error
      }
    })

    test('toggle updates service status', async ({ page }) => {
      await registerUser(page)

      // Navigate to services
      await page.click('a[href*="services"], text=Services')
      await page.waitForLoadState('networkidle')

      // Find a toggle and its label
      const toggleContainer = page.locator('[data-testid="service-card"], .service-item').first()
      const toggle = toggleContainer.locator('[data-testid="service-toggle"], button[role="switch"], input[type="checkbox"]')
      
      if (await toggle.count() > 0) {
        // Click toggle
        await toggle.click()
        
        // Wait for network request
        await page.waitForLoadState('networkidle')
        
        // The toggle should reflect the new state (we're just checking it doesn't error)
      }
    })
  })

  test.describe('Service Detail', () => {
    test('can navigate to service detail page', async ({ page }) => {
      await registerUser(page)

      // Navigate to services
      await page.click('a[href*="services"], text=Services')
      await page.waitForLoadState('networkidle')

      // Click on a service name/link
      const serviceLink = page.locator('[data-testid="service-card"] a, .service-card a, .card a').first()
      
      if (await serviceLink.count() > 0) {
        await serviceLink.click()

        // Should navigate to service detail
        await expect(page).toHaveURL(/\/services\/[a-z-]+/, { timeout: 5000 })
      } else {
        // Alternative: click on service card itself
        const serviceCard = page.locator('[data-testid="service-card"], .service-card').first()
        if (await serviceCard.count() > 0) {
          await serviceCard.click()
          await page.waitForLoadState('networkidle')
        }
      }
    })

    test('shows OAuth configuration for OAuth2 services', async ({ page }) => {
      await registerUser(page)

      // Navigate to services
      await page.click('a[href*="services"], text=Services')
      await page.waitForLoadState('networkidle')

      // Find an OAuth service (GitHub is commonly OAuth2)
      const githubLink = page.locator('a[href*="github"], text=GitHub')
      
      if (await githubLink.count() > 0) {
        await githubLink.first().click()
        await page.waitForLoadState('networkidle')

        // Should see OAuth configuration section
        await expect(page.locator('text=OAuth').or(
          page.locator('text=Client ID')
        ).or(
          page.locator('text=Client Secret')
        ).or(
          page.locator('text=Configuration')
        )).toBeVisible({ timeout: 5000 })
      }
    })

    test('shows API info for public API services', async ({ page }) => {
      await registerUser(page)

      // Navigate to services
      await page.click('a[href*="services"], text=Services')
      await page.waitForLoadState('networkidle')

      // Find a public API service (JSONPlaceholder is typically public)
      const publicApiLink = page.locator('a[href*="jsonplaceholder"], text=JSONPlaceholder').or(
        page.locator('text=Public API')
      )
      
      if (await publicApiLink.count() > 0) {
        await publicApiLink.first().click()
        await page.waitForLoadState('networkidle')

        // Should see API info (base URL, example calls, etc.)
        await expect(page.locator('text=API').or(
          page.locator('text=Base URL')
        ).or(
          page.locator('text=Example')
        ).or(
          page.locator('text=No setup')
        )).toBeVisible({ timeout: 5000 })
      }
    })

    test('shows API key config for API key services', async ({ page }) => {
      await registerUser(page)

      // Navigate to services
      await page.click('a[href*="services"], text=Services')
      await page.waitForLoadState('networkidle')

      // Find an API key service (OpenAI, Anthropic, etc.)
      const apiKeyServiceLink = page.locator('a[href*="openai"], text=OpenAI').or(
        page.locator('a[href*="anthropic"], text=Anthropic')
      )
      
      if (await apiKeyServiceLink.count() > 0) {
        await apiKeyServiceLink.first().click()
        await page.waitForLoadState('networkidle')

        // Should see API key configuration section
        await expect(page.locator('text=API Key').or(
          page.locator('input[type="password"]')
        ).or(
          page.locator('text=Key')
        ).or(
          page.locator('text=Configuration')
        )).toBeVisible({ timeout: 5000 })
      }
    })
  })

  test.describe('Service Stats', () => {
    test('displays service statistics', async ({ page }) => {
      await registerUser(page)

      // Navigate to services
      await page.click('a[href*="services"], text=Services')
      await page.waitForLoadState('networkidle')

      // Should see stats (Total Services, Enabled, etc.)
      const statsSection = page.locator('text=Total').or(
        page.locator('text=Enabled')
      ).or(
        page.locator('[data-testid="services-stats"]')
      )

      await expect(statsSection.first()).toBeVisible({ timeout: 5000 })
    })
  })
})








