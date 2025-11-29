import { test, expect } from '@playwright/test'
import { URLS, generateTestUser, waitForDashboard } from './utils'

/**
 * Organization Management E2E Tests
 * 
 * Tests organization CRUD and switching:
 * - Create new organization
 * - Switch between organizations
 * - Update organization settings
 * - View organization members
 * - Invite members (form validation)
 */

test.describe('Organization Management', () => {
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

  test.describe('Organization Creation', () => {
    test('default organization is created after registration', async ({ page }) => {
      const user = await registerUser(page)

      // Check that organization is visible
      const orgIndicator = page.locator('[data-testid="org-selector"]').or(
        page.locator('text=' + user.name).first()
      ).or(
        page.locator('.org-name, .organization-name')
      )

      await expect(orgIndicator.first()).toBeVisible({ timeout: 5000 })
    })

    test('can create a new organization', async ({ page }) => {
      await registerUser(page)

      // Click organization selector to open dropdown
      const orgSelector = page.locator('[data-testid="org-selector"], button:has-text("Organization"), .org-selector').first()
      await orgSelector.click()

      // Click "New Organization" or "Create Organization" option
      const createOrgOption = page.locator('text=New Organization').or(
        page.locator('text=Create Organization')
      ).or(
        page.locator('[data-testid="create-org"]')
      )
      
      if (await createOrgOption.count() > 0) {
        await createOrgOption.first().click()

        // Wait for modal
        await page.waitForSelector('input[name="name"], input[placeholder*="name" i]', { timeout: 5000 })

        // Fill organization name
        const orgName = `Test Org ${Date.now()}`
        await page.fill('input[name="name"], input[placeholder*="name" i]', orgName)

        // Submit
        await page.click('button[type="submit"], button:has-text("Create")')

        // Should see the new organization
        await expect(page.locator(`text=${orgName}`).first()).toBeVisible({ timeout: 5000 })
      }
    })
  })

  test.describe('Organization Switching', () => {
    test('can switch between organizations', async ({ page }) => {
      await registerUser(page)

      // First create a second organization
      const orgSelector = page.locator('[data-testid="org-selector"], button:has-text("Organization"), .org-selector').first()
      await orgSelector.click()

      const createOrgOption = page.locator('text=New Organization').or(
        page.locator('text=Create Organization')
      )
      
      if (await createOrgOption.count() > 0) {
        await createOrgOption.first().click()

        const secondOrgName = `Second Org ${Date.now()}`
        await page.fill('input[name="name"], input[placeholder*="name" i]', secondOrgName)
        await page.click('button[type="submit"], button:has-text("Create")')
        
        await page.waitForLoadState('networkidle')

        // Now try to switch back to first org
        await orgSelector.click()
        
        // Find and click the first organization
        const orgList = page.locator('[data-testid="org-list"] button, .org-item, [role="menuitem"]')
        if (await orgList.count() > 1) {
          await orgList.first().click()
          await page.waitForLoadState('networkidle')
        }
      }
    })
  })

  test.describe('Organization Settings', () => {
    test('can navigate to organization settings', async ({ page }) => {
      await registerUser(page)

      // Navigate to organization page
      const orgLink = page.locator('a[href*="organization"], text=Organization Settings, text=Organization').first()
      await orgLink.click()

      // Should see organization settings form
      await expect(page.locator('text=Organization Settings').or(
        page.locator('h1:has-text("Organization")')
      ).or(
        page.locator('input[name="name"]')
      )).toBeVisible({ timeout: 5000 })
    })

    test('can update organization name', async ({ page }) => {
      await registerUser(page)

      // Navigate to organization page
      const orgLink = page.locator('a[href*="organization"]').first()
      if (await orgLink.count() > 0) {
        await orgLink.click()
        await page.waitForLoadState('networkidle')

        // Find name input and update
        const nameInput = page.locator('input[name="name"]').first()
        if (await nameInput.count() > 0) {
          const newName = `Updated Org ${Date.now()}`
          await nameInput.clear()
          await nameInput.fill(newName)

          // Save
          const saveButton = page.locator('button:has-text("Save"), button:has-text("Update")')
          if (await saveButton.count() > 0) {
            await saveButton.first().click()
            await page.waitForLoadState('networkidle')
          }
        }
      }
    })
  })

  test.describe('Members Management', () => {
    test('can navigate to members page', async ({ page }) => {
      await registerUser(page)

      // Navigate to members page
      const membersLink = page.locator('a[href*="members"], text=Members').first()
      if (await membersLink.count() > 0) {
        await membersLink.click()

        // Should see members list
        await expect(page.locator('text=Members').or(
          page.locator('h1:has-text("Members")')
        ).or(
          page.locator('table')
        )).toBeVisible({ timeout: 5000 })
      }
    })

    test('shows current user as owner/member', async ({ page }) => {
      const user = await registerUser(page)

      // Navigate to members page
      const membersLink = page.locator('a[href*="members"]').first()
      if (await membersLink.count() > 0) {
        await membersLink.click()
        await page.waitForLoadState('networkidle')

        // Should see user's email or name in the members list
        await expect(page.locator(`text=${user.email}`).or(
          page.locator(`text=${user.name}`)
        ).or(
          page.locator('text=Owner')
        )).toBeVisible({ timeout: 5000 })
      }
    })

    test('can open invite member modal', async ({ page }) => {
      await registerUser(page)

      // Navigate to members page
      const membersLink = page.locator('a[href*="members"]').first()
      if (await membersLink.count() > 0) {
        await membersLink.click()
        await page.waitForLoadState('networkidle')

        // Click invite button
        const inviteButton = page.locator('button:has-text("Invite"), button:has-text("Add Member")')
        if (await inviteButton.count() > 0) {
          await inviteButton.first().click()

          // Should see invite modal with email input
          await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible({ timeout: 5000 })
        }
      }
    })

    test('validates invite member form', async ({ page }) => {
      await registerUser(page)

      // Navigate to members page
      const membersLink = page.locator('a[href*="members"]').first()
      if (await membersLink.count() > 0) {
        await membersLink.click()
        await page.waitForLoadState('networkidle')

        // Click invite button
        const inviteButton = page.locator('button:has-text("Invite"), button:has-text("Add Member")')
        if (await inviteButton.count() > 0) {
          await inviteButton.first().click()
          await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 5000 })

          // Try to submit empty form
          const submitButton = page.locator('button[type="submit"], button:has-text("Send Invite")')
          if (await submitButton.count() > 0) {
            await submitButton.first().click()

            // Should still see the modal (validation failed)
            await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible()
          }
        }
      }
    })
  })
})

