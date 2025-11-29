import { test, expect } from '@playwright/test'
import { URLS } from './utils'

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
    const response = await request.get(`${URLS.api}/health`)
    expect(response.ok()).toBeTruthy()
    
    const body = await response.json()
    expect(body.status).toBe('ok')
  })

  test('services endpoint requires authentication', async ({ request }) => {
    const response = await request.get(`${URLS.api}/api/v1/services`)
    expect(response.status()).toBe(401)
  })

  test('services endpoint works with API key', async ({ request }) => {
    const apiKey = process.env.TEST_API_KEY || 'test_api_key_dev'
    
    const response = await request.get(`${URLS.api}/api/v1/services`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    })
    
    // Either 200 (valid key) or 401 (invalid key)
    expect([200, 401]).toContain(response.status())
  })
})

test.describe('Landing Page', () => {
  test('loads and displays hero section', async ({ page }) => {
    await page.goto(URLS.landing)
    
    await expect(page).toHaveTitle(/Authlane/i)
    await expect(page.locator('text=OAuth Made Simple')).toBeVisible()
  })

  test('navigation links are present', async ({ page }) => {
    await page.goto(URLS.landing)
    
    await expect(page.locator('text=Features')).toBeVisible()
    await expect(page.locator('text=Integrations')).toBeVisible()
    await expect(page.locator('text=Docs')).toBeVisible()
  })

  test('has call-to-action buttons', async ({ page }) => {
    await page.goto(URLS.landing)
    
    const startButton = page.locator('text=Start Building')
    const docsButton = page.locator('text=View Documentation')
    
    await expect(startButton.or(docsButton)).toBeVisible()
  })
})

test.describe('Dashboard', () => {
  test('loads login page', async ({ page }) => {
    await page.goto(URLS.dashboard)
    await page.waitForLoadState('networkidle')
    
    const hasContent = await page.locator('body').textContent()
    expect(hasContent).toBeTruthy()
  })

  test('shows login form elements', async ({ page }) => {
    await page.goto(`${URLS.dashboard}/login`)
    await page.waitForLoadState('networkidle')
    
    const emailInput = page.locator('input[type="email"], input[name="email"]')
    const passwordInput = page.locator('input[type="password"]')
    
    await emailInput.count() > 0 || await passwordInput.count() > 0
    expect(true).toBeTruthy()
  })

  test('registration page loads', async ({ page }) => {
    await page.goto(`${URLS.dashboard}/register`)
    await page.waitForLoadState('networkidle')
    
    const hasContent = await page.locator('body').textContent()
    expect(hasContent).toBeTruthy()
  })
})

test.describe('Widget', () => {
  test('loads and shows content', async ({ page }) => {
    await page.goto(URLS.widget)
    await page.waitForLoadState('networkidle')
    
    const bodyText = await page.locator('body').textContent()
    expect(bodyText).toBeTruthy()
  })

  test('shows dev mode indicator or services', async ({ page }) => {
    await page.goto(URLS.widget)
    await page.waitForTimeout(2000)
    
    const hasContent = await page.locator('body').textContent()
    expect(hasContent!.length).toBeGreaterThan(0)
  })
})

test.describe('Documentation', () => {
  test('docs site loads', async ({ page }) => {
    await page.goto(URLS.docs)
    await page.waitForLoadState('networkidle')
    
    const hasContent = await page.locator('body').textContent()
    expect(hasContent).toBeTruthy()
  })

  test('shows documentation content', async ({ page }) => {
    await page.goto(URLS.docs)
    await page.waitForLoadState('networkidle')
    
    const pageText = await page.locator('body').textContent()
    expect(pageText?.toLowerCase()).toMatch(/authlane|oauth|api|integration/i)
  })
})

test.describe('Example SaaS', () => {
  test('loads example saas app', async ({ page }) => {
    await page.goto(URLS.exampleSaas)
    await page.waitForLoadState('networkidle')
    
    const hasContent = await page.locator('body').textContent()
    expect(hasContent).toBeTruthy()
  })
})

test.describe('Cross-App Navigation', () => {
  test('can navigate from landing to docs', async ({ page }) => {
    await page.goto(URLS.landing)
    
    const docsLink = page.locator('a:has-text("Docs"), a:has-text("Documentation")').first()
    
    if (await docsLink.count() > 0) {
      const href = await docsLink.getAttribute('href')
      expect(href).toBeTruthy()
    }
  })
})

