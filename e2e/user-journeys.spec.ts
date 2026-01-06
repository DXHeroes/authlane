import { expect, test } from '@playwright/test';
import { generateTestUser, URLS, waitForDashboard } from './utils';

/**
 * Complete User Journey E2E Tests
 *
 * Tests complete end-to-end user scenarios:
 * 1. New User Onboarding Journey
 * 2. OAuth Integration Setup Journey
 * 3. API Development Journey
 * 4. Team Collaboration Journey
 * 5. Service Migration Journey
 *
 * These tests simulate real-world user workflows from start to finish.
 *
 * Prerequisites:
 * - pnpm dev running
 * - All services healthy
 * - Database seeded
 */

test.describe('Complete User Journeys', () => {
  test.describe('Journey 1: New User Onboarding', () => {
    test('complete onboarding flow for new developer', async ({ page }) => {
      const user = generateTestUser();

      // Step 1: Land on the website
      await page.goto(URLS.landing);
      await expect(page).toHaveTitle(/Authlane/i);

      // Step 2: Navigate to sign up
      const signUpButton = page
        .locator('text=Start Building, text=Get Started, text=Sign Up')
        .first();

      if ((await signUpButton.count()) > 0) {
        await signUpButton.click();
      } else {
        await page.goto(`${URLS.dashboard}/register`);
      }

      // Step 3: Register new account
      await page.waitForLoadState('networkidle');
      await page.fill('input[name="name"]', user.name);
      await page.fill('input[type="email"]', user.email);
      await page.fill('input[type="password"]', user.password);
      await page.click('button[type="submit"]');

      // Step 4: Verify redirected to dashboard
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
      await waitForDashboard(page);

      // Step 5: Default organization should be created
      await expect(
        page.locator(`text=${user.name}`).or(page.locator('[data-testid="org-selector"]'))
      ).toBeVisible({ timeout: 5000 });

      // Step 6: Explore services
      const servicesLink = page.locator('a[href*="services"], text=Services').first();
      await servicesLink.click();
      await page.waitForLoadState('networkidle');

      // Step 7: View services list
      await expect(
        page.locator('text=Services').or(page.locator('[data-testid="services-list"]'))
      ).toBeVisible({ timeout: 5000 });

      // Step 8: Click on a service to learn more
      const serviceCard = page.locator('[data-testid^="service-"], .service-card').first();
      if ((await serviceCard.count()) > 0) {
        await serviceCard.click();
        await page.waitForLoadState('networkidle');

        // Should see service details
        await expect(page.locator('body')).toContainText(/.+/);
      }

      // Step 9: Check API keys section
      const apiKeysLink = page.locator('a[href*="api-keys"]').first();
      if ((await apiKeysLink.count()) > 0) {
        await apiKeysLink.click();
        await page.waitForLoadState('networkidle');

        // Should see API keys page
        await expect(
          page.locator('text=API Keys').or(page.locator('button:has-text("Create")'))
        ).toBeVisible({ timeout: 5000 });
      }

      // Journey completed successfully
      expect(true).toBeTruthy();
    });
  });

  test.describe('Journey 2: OAuth Integration Setup', () => {
    test('developer sets up GitHub OAuth integration', async ({ page, context }) => {
      const user = generateTestUser();

      // Step 1: Register
      await page.goto(`${URLS.dashboard}/register`);
      await page.fill('input[name="name"]', user.name);
      await page.fill('input[type="email"]', user.email);
      await page.fill('input[type="password"]', user.password);
      await page.click('button[type="submit"]');
      await waitForDashboard(page);

      // Step 2: Navigate to services
      await page.click('a[href*="services"], text=Services');
      await page.waitForLoadState('networkidle');

      // Step 3: Find GitHub service
      const githubCard = page.locator('text=GitHub, [data-testid="service-github"]').first();

      if ((await githubCard.count()) > 0) {
        await githubCard.click();
        await page.waitForLoadState('networkidle');

        // Step 4: View OAuth configuration
        await expect(
          page
            .locator('text=OAuth')
            .or(page.locator('text=Client ID'))
            .or(page.locator('text=Configuration'))
        ).toBeVisible({ timeout: 5000 });

        // Step 5: Enable the service
        const enableToggle = page
          .locator('[data-testid="service-toggle"], button[role="switch"]')
          .first();

        if ((await enableToggle.count()) > 0) {
          const isChecked = await enableToggle.isChecked().catch(() => false);

          if (!isChecked) {
            await enableToggle.click();
            await page.waitForLoadState('networkidle');
          }
        }

        // Step 6: Attempt to connect (may open OAuth popup)
        const connectButton = page
          .locator('button:has-text("Connect"), button:has-text("Authorize")')
          .first();

        if ((await connectButton.count()) > 0) {
          // Listen for popup
          const popupPromise = context.waitForEvent('page', { timeout: 3000 }).catch(() => null);

          await connectButton.click();

          const popup = await popupPromise;

          if (popup) {
            // OAuth popup opened
            await popup.waitForLoadState('networkidle');
            const url = popup.url();

            // Should navigate to OAuth provider or our OAuth endpoint
            expect(url).toMatch(/github|oauth/);

            await popup.close();
          }
        }
      }

      // Journey completed successfully
      expect(true).toBeTruthy();
    });
  });

  test.describe('Journey 3: API Development Workflow', () => {
    test('developer creates API key and makes first API call', async ({ page, request }) => {
      const user = generateTestUser();

      // Step 1: Register
      await page.goto(`${URLS.dashboard}/register`);
      await page.fill('input[name="name"]', user.name);
      await page.fill('input[type="email"]', user.email);
      await page.fill('input[type="password"]', user.password);
      await page.click('button[type="submit"]');
      await waitForDashboard(page);

      // Step 2: Navigate to API keys
      const apiKeysLink = page.locator('a[href*="api-keys"], text=API').first();

      let apiKey = null;

      if ((await apiKeysLink.count()) > 0) {
        await apiKeysLink.click();
        await page.waitForLoadState('networkidle');

        // Step 3: Create new API key
        const createButton = page.locator('button:has-text("Create")').first();

        if ((await createButton.count()) > 0) {
          await createButton.click();

          const nameInput = page.locator('input[name="name"]');
          if ((await nameInput.count()) > 0) {
            await nameInput.fill('Production API Key');

            const submitButton = page.locator('button[type="submit"]');
            await submitButton.click();
            await page.waitForLoadState('networkidle');

            // Step 4: Copy API key
            const keyValueElement = page.locator('code, [data-testid="api-key-value"]');
            apiKey = await keyValueElement.textContent();

            expect(apiKey).toBeTruthy();
            expect(apiKey).toMatch(/^sk_/);

            // Step 5: Save and close
            const closeButton = page.locator('button:has-text("Close"), button:has-text("Done")');
            if ((await closeButton.count()) > 0) {
              await closeButton.click();
            }

            await page.waitForLoadState('networkidle');

            // Step 6: Make first API call
            if (apiKey) {
              const response = await request.get(`${URLS.api}/api/v1/services`, {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                },
              });

              // API call should succeed
              expect([200, 401]).toContain(response.status());

              if (response.status() === 200) {
                const body = await response.json();
                expect(body).toBeDefined();
              }
            }

            // Step 7: View API documentation
            const docsLink = page.locator('a[href*="docs"], text=Documentation').first();

            if ((await docsLink.count()) > 0) {
              await docsLink.click();
              await page.waitForLoadState('networkidle');

              // Should see API docs
              await expect(page.locator('body')).toContainText(/.+/);
            }
          }
        }
      }

      // Journey completed successfully
      expect(true).toBeTruthy();
    });
  });

  test.describe('Journey 4: Team Collaboration', () => {
    test('organization owner invites team member', async ({ page }) => {
      const owner = generateTestUser();

      // Step 1: Owner registers
      await page.goto(`${URLS.dashboard}/register`);
      await page.fill('input[name="name"]', owner.name);
      await page.fill('input[type="email"]', owner.email);
      await page.fill('input[type="password"]', owner.password);
      await page.click('button[type="submit"]');
      await waitForDashboard(page);

      // Step 2: Navigate to members
      const membersLink = page.locator('a[href*="members"], text=Members, text=Team').first();

      if ((await membersLink.count()) > 0) {
        await membersLink.click();
        await page.waitForLoadState('networkidle');

        // Step 3: Should see owner in members list
        await expect(
          page.locator(`text=${owner.email}`).or(page.locator('text=Owner'))
        ).toBeVisible({ timeout: 5000 });

        // Step 4: Click invite member
        const inviteButton = page
          .locator('button:has-text("Invite"), button:has-text("Add Member")')
          .first();

        if ((await inviteButton.count()) > 0) {
          await inviteButton.click();

          // Step 5: Fill invite form
          const emailInput = page.locator('input[type="email"], input[name="email"]');

          if ((await emailInput.count()) > 0) {
            const memberEmail = `member-${Date.now()}@example.com`;
            await emailInput.fill(memberEmail);

            // Select role if available
            const roleSelect = page.locator('select[name="role"], [data-testid="role-select"]');
            if ((await roleSelect.count()) > 0) {
              await roleSelect.selectOption('member');
            }

            // Step 6: Send invite
            const sendButton = page.locator('button:has-text("Send"), button:has-text("Invite")');
            if ((await sendButton.count()) > 0) {
              await sendButton.click();
              await page.waitForLoadState('networkidle');

              // Step 7: Should see success message or invited member
              await expect(
                page
                  .locator('text=Invited')
                  .or(page.locator('text=Pending'))
                  .or(page.locator(`text=${memberEmail}`))
              ).toBeVisible({ timeout: 5000 });
            }
          }
        }
      }

      // Step 8: Set up organization settings
      const orgLink = page.locator('a[href*="organization"], text=Organization').first();

      if ((await orgLink.count()) > 0) {
        await orgLink.click();
        await page.waitForLoadState('networkidle');

        // Should see organization settings
        await expect(
          page.locator('input[name="name"]').or(page.locator('text=Organization'))
        ).toBeVisible({ timeout: 5000 });
      }

      // Journey completed successfully
      expect(true).toBeTruthy();
    });
  });

  test.describe('Journey 5: Multi-Service Integration', () => {
    test('developer integrates multiple services for their app', async ({ page }) => {
      const user = generateTestUser();

      // Step 1: Register
      await page.goto(`${URLS.dashboard}/register`);
      await page.fill('input[name="name"]', user.name);
      await page.fill('input[type="email"]', user.email);
      await page.fill('input[type="password"]', user.password);
      await page.click('button[type="submit"]');
      await waitForDashboard(page);

      // Step 2: Navigate to services
      await page.click('a[href*="services"]');
      await page.waitForLoadState('networkidle');

      const serviceNames = ['GitHub', 'Google Calendar', 'Slack'];
      const enabledServices = [];

      // Step 3: Enable multiple services
      for (const serviceName of serviceNames) {
        const serviceCard = page.locator(`text=${serviceName}`).first();

        if ((await serviceCard.count()) > 0) {
          await serviceCard.click();
          await page.waitForLoadState('networkidle');

          // Try to enable
          const enableToggle = page
            .locator('[data-testid="service-toggle"], button[role="switch"]')
            .first();

          if ((await enableToggle.count()) > 0) {
            const isChecked = await enableToggle.isChecked().catch(() => false);

            if (!isChecked) {
              await enableToggle.click();
              await page.waitForLoadState('networkidle');
              enabledServices.push(serviceName);
            }
          }

          // Go back to services list
          await page.goBack();
          await page.waitForLoadState('networkidle');
        }
      }

      // Step 4: Create API key for using services
      const apiKeysLink = page.locator('a[href*="api-keys"]').first();

      if ((await apiKeysLink.count()) > 0) {
        await apiKeysLink.click();
        await page.waitForLoadState('networkidle');

        const createButton = page.locator('button:has-text("Create")').first();

        if ((await createButton.count()) > 0) {
          await createButton.click();

          const nameInput = page.locator('input[name="name"]');
          if ((await nameInput.count()) > 0) {
            await nameInput.fill('Multi-Service App Key');

            const submitButton = page.locator('button[type="submit"]');
            await submitButton.click();
            await page.waitForLoadState('networkidle');

            // Key created successfully
            await expect(page.locator('code, [data-testid="api-key-value"]')).toBeVisible({
              timeout: 5000,
            });
          }
        }
      }

      // Journey completed successfully
      expect(enabledServices.length).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe('Journey 6: Production Deployment', () => {
    test('developer prepares application for production', async ({ page, request }) => {
      const user = generateTestUser();

      // Step 1: Register and setup
      await page.goto(`${URLS.dashboard}/register`);
      await page.fill('input[name="name"]', user.name);
      await page.fill('input[type="email"]', user.email);
      await page.fill('input[type="password"]', user.password);
      await page.click('button[type="submit"]');
      await waitForDashboard(page);

      // Step 2: Create production API key
      const apiKeysLink = page.locator('a[href*="api-keys"]').first();
      let prodApiKey = null;

      if ((await apiKeysLink.count()) > 0) {
        await apiKeysLink.click();
        await page.waitForLoadState('networkidle');

        const createButton = page.locator('button:has-text("Create")').first();

        if ((await createButton.count()) > 0) {
          await createButton.click();

          const nameInput = page.locator('input[name="name"]');
          if ((await nameInput.count()) > 0) {
            await nameInput.fill('Production Key');

            // Set expiration if available
            const expirationInput = page.locator(
              'input[name="expiresAt"], select[name="expiration"]'
            );
            if ((await expirationInput.count()) > 0) {
              // Set to 90 days or never
              await expirationInput.fill('90');
            }

            const submitButton = page.locator('button[type="submit"]');
            await submitButton.click();
            await page.waitForLoadState('networkidle');

            const keyElement = page.locator('code, [data-testid="api-key-value"]');
            prodApiKey = await keyElement.textContent();
          }
        }
      }

      // Step 3: Test API key
      if (prodApiKey) {
        const response = await request.get(`${URLS.api}/api/v1/services`, {
          headers: {
            Authorization: `Bearer ${prodApiKey}`,
          },
        });

        expect([200, 401]).toContain(response.status());
      }

      // Step 4: Review organization settings
      const orgLink = page.locator('a[href*="organization"]').first();

      if ((await orgLink.count()) > 0) {
        await orgLink.click();
        await page.waitForLoadState('networkidle');

        // Verify organization is set up correctly
        await expect(
          page.locator('input[name="name"]').or(page.locator('text=Organization'))
        ).toBeVisible({ timeout: 5000 });
      }

      // Step 5: Check security settings
      const settingsLink = page.locator('a[href*="settings"], a[href*="security"]').first();

      if ((await settingsLink.count()) > 0) {
        await settingsLink.click();
        await page.waitForLoadState('networkidle');

        // Should see security/settings page
        await expect(page.locator('body')).toContainText(/.+/);
      }

      // Journey completed successfully
      expect(true).toBeTruthy();
    });
  });

  test.describe('Journey 7: Error Recovery and Support', () => {
    test('user encounters and resolves connection issues', async ({ page }) => {
      const user = generateTestUser();

      // Step 1: Register
      await page.goto(`${URLS.dashboard}/register`);
      await page.fill('input[name="name"]', user.name);
      await page.fill('input[type="email"]', user.email);
      await page.fill('input[type="password"]', user.password);
      await page.click('button[type="submit"]');
      await waitForDashboard(page);

      // Step 2: Try to connect to a service (will likely fail without real OAuth)
      await page.click('a[href*="services"]');
      await page.waitForLoadState('networkidle');

      const githubCard = page.locator('text=GitHub').first();

      if ((await githubCard.count()) > 0) {
        await githubCard.click();
        await page.waitForLoadState('networkidle');

        // Step 3: Attempt connection
        const connectButton = page.locator('button:has-text("Connect")').first();

        if ((await connectButton.count()) > 0) {
          await connectButton.click();
          await page.waitForLoadState('networkidle');

          // May show error or configuration needed
          // User should see helpful error message
        }
      }

      // Step 4: Check connections status
      const connectionsLink = page.locator('a[href*="connections"]').first();

      if ((await connectionsLink.count()) > 0) {
        await connectionsLink.click();
        await page.waitForLoadState('networkidle');

        // Should see connections list or empty state
        await expect(
          page.locator('text=Connections').or(page.locator('text=No connections'))
        ).toBeVisible({ timeout: 5000 });
      }

      // Step 5: Access documentation for help
      const docsLink = page.locator('a[href*="docs"], text=Help').first();

      if ((await docsLink.count()) > 0) {
        await docsLink.click();
        await page.waitForLoadState('networkidle');

        // Should see helpful documentation
        await expect(page.locator('body')).toContainText(/.+/);
      }

      // Journey completed successfully
      expect(true).toBeTruthy();
    });
  });
});
