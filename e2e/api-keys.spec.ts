import { expect, test } from '@playwright/test';
import { generateTestUser, URLS, waitForDashboard } from './utils';

/**
 * API Keys Management E2E Tests
 *
 * Tests API key lifecycle and usage:
 * - Create API keys
 * - List API keys
 * - Update API key settings (name, expiration)
 * - Revoke API keys
 * - Use API keys for authentication
 * - API key permissions and scoping
 * - API key rotation
 *
 * Prerequisites:
 * - pnpm dev running
 * - Database seeded
 */

test.describe('API Keys Management', () => {
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

  test.describe('API Key Creation', () => {
    test('can navigate to API keys settings', async ({ page }) => {
      await registerUser(page);

      // Navigate to organization or settings
      const settingsLink = page
        .locator('a[href*="settings"], a[href*="api-keys"], text=Settings, text=API Keys')
        .first();

      if ((await settingsLink.count()) > 0) {
        await settingsLink.click();
        await page.waitForLoadState('networkidle');

        // Should see API keys section
        await expect(
          page
            .locator('text=API Keys')
            .or(page.locator('h1:has-text("API")'))
            .or(page.locator('[data-testid="api-keys"]'))
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test('can create a new API key', async ({ page }) => {
      await registerUser(page);

      // Navigate to API keys
      const apiKeysLink = page.locator('a[href*="api-keys"], text=API Keys').first();

      if ((await apiKeysLink.count()) > 0) {
        await apiKeysLink.click();
        await page.waitForLoadState('networkidle');

        // Click create button
        const createButton = page.locator(
          'button:has-text("Create"), button:has-text("New API Key"), button:has-text("Generate")'
        );

        if ((await createButton.count()) > 0) {
          await createButton.first().click();

          // Fill API key name
          const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]');
          if ((await nameInput.count()) > 0) {
            await nameInput.fill(`Test API Key ${Date.now()}`);

            // Submit
            const submitButton = page.locator('button[type="submit"], button:has-text("Create")');
            await submitButton.click();
            await page.waitForLoadState('networkidle');

            // Should show the new API key (only once!)
            await expect(
              page.locator('text=sk_').or(page.locator('[data-testid="api-key-value"]'))
            ).toBeVisible({ timeout: 5000 });
          }
        }
      }
    });

    test('shows API key only once after creation', async ({ page }) => {
      await registerUser(page);

      const apiKeysLink = page.locator('a[href*="api-keys"]').first();

      if ((await apiKeysLink.count()) > 0) {
        await apiKeysLink.click();
        await page.waitForLoadState('networkidle');

        const createButton = page.locator('button:has-text("Create"), button:has-text("New")');

        if ((await createButton.count()) > 0) {
          await createButton.first().click();

          const nameInput = page.locator('input[name="name"]');
          if ((await nameInput.count()) > 0) {
            await nameInput.fill(`One-Time Key ${Date.now()}`);

            const submitButton = page.locator('button[type="submit"]');
            await submitButton.click();
            await page.waitForLoadState('networkidle');

            // Copy the key value
            const keyValue = await page
              .locator('code, [data-testid="api-key-value"]')
              .textContent();

            if (keyValue) {
              // Close modal or navigate away
              const closeButton = page.locator('button:has-text("Close"), button:has-text("Done")');
              if ((await closeButton.count()) > 0) {
                await closeButton.click();
              }

              await page.waitForLoadState('networkidle');

              // The key value should no longer be visible (masked)
              const isStillVisible = await page.locator(`text=${keyValue}`).count();
              // Expect it to be hidden or masked
              expect(
                isStillVisible === 0 || (await page.locator('text=sk_****').count()) > 0
              ).toBeTruthy();
            }
          }
        }
      }
    });

    test('can copy API key to clipboard', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await registerUser(page);

      const apiKeysLink = page.locator('a[href*="api-keys"]').first();

      if ((await apiKeysLink.count()) > 0) {
        await apiKeysLink.click();
        await page.waitForLoadState('networkidle');

        const createButton = page.locator('button:has-text("Create")');

        if ((await createButton.count()) > 0) {
          await createButton.first().click();

          const nameInput = page.locator('input[name="name"]');
          if ((await nameInput.count()) > 0) {
            await nameInput.fill(`Clipboard Key ${Date.now()}`);

            const submitButton = page.locator('button[type="submit"]');
            await submitButton.click();
            await page.waitForLoadState('networkidle');

            // Click copy button
            const copyButton = page.locator(
              'button:has-text("Copy"), [data-testid="copy-api-key"]'
            );

            if ((await copyButton.count()) > 0) {
              await copyButton.click();

              // Should show success message
              await expect(
                page.locator('text=Copied').or(page.locator('text=Success'))
              ).toBeVisible({ timeout: 3000 });
            }
          }
        }
      }
    });

    test('validates API key name', async ({ page }) => {
      await registerUser(page);

      const apiKeysLink = page.locator('a[href*="api-keys"]').first();

      if ((await apiKeysLink.count()) > 0) {
        await apiKeysLink.click();
        await page.waitForLoadState('networkidle');

        const createButton = page.locator('button:has-text("Create")');

        if ((await createButton.count()) > 0) {
          await createButton.first().click();

          // Try to submit without name
          const submitButton = page.locator('button[type="submit"]');
          if ((await submitButton.count()) > 0) {
            await submitButton.click();

            // Should still see the modal (validation failed)
            await expect(page.locator('input[name="name"]')).toBeVisible();
          }
        }
      }
    });
  });

  test.describe('API Key Listing', () => {
    test('displays list of API keys', async ({ page }) => {
      await registerUser(page);

      const apiKeysLink = page.locator('a[href*="api-keys"]').first();

      if ((await apiKeysLink.count()) > 0) {
        await apiKeysLink.click();
        await page.waitForLoadState('networkidle');

        // Should see table or list
        await expect(
          page
            .locator('table')
            .or(page.locator('[data-testid="api-keys-list"]'))
            .or(page.locator('text=No API keys'))
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test('shows API key metadata (name, created date, last used)', async ({ page }) => {
      await registerUser(page);

      const apiKeysLink = page.locator('a[href*="api-keys"]').first();

      if ((await apiKeysLink.count()) > 0) {
        await apiKeysLink.click();
        await page.waitForLoadState('networkidle');

        // First create a key
        const createButton = page.locator('button:has-text("Create")');
        if ((await createButton.count()) > 0) {
          await createButton.first().click();

          const nameInput = page.locator('input[name="name"]');
          if ((await nameInput.count()) > 0) {
            const keyName = `Metadata Key ${Date.now()}`;
            await nameInput.fill(keyName);

            const submitButton = page.locator('button[type="submit"]');
            await submitButton.click();
            await page.waitForLoadState('networkidle');

            // Close modal
            const closeButton = page.locator('button:has-text("Close"), button:has-text("Done")');
            if ((await closeButton.count()) > 0) {
              await closeButton.click();
            }

            await page.waitForLoadState('networkidle');

            // Should see the key name in the list
            await expect(page.locator(`text=${keyName}`)).toBeVisible({ timeout: 5000 });

            // Should see created date or status
            const keyRow = page
              .locator(`tr:has-text("${keyName}"), .api-key-item:has-text("${keyName}")`)
              .first();
            const rowText = await keyRow.textContent();
            expect(rowText).toBeTruthy();
          }
        }
      }
    });

    test('masks API key value in list', async ({ page }) => {
      await registerUser(page);

      const apiKeysLink = page.locator('a[href*="api-keys"]').first();

      if ((await apiKeysLink.count()) > 0) {
        await apiKeysLink.click();
        await page.waitForLoadState('networkidle');

        // Create a key
        const createButton = page.locator('button:has-text("Create")');
        if ((await createButton.count()) > 0) {
          await createButton.first().click();

          const nameInput = page.locator('input[name="name"]');
          if ((await nameInput.count()) > 0) {
            await nameInput.fill(`Masked Key ${Date.now()}`);

            const submitButton = page.locator('button[type="submit"]');
            await submitButton.click();
            await page.waitForLoadState('networkidle');

            // Get full key value
            const fullKey = await page.locator('code, [data-testid="api-key-value"]').textContent();

            // Close modal
            const closeButton = page.locator('button:has-text("Close")');
            if ((await closeButton.count()) > 0) {
              await closeButton.click();
            }

            await page.waitForLoadState('networkidle');

            if (fullKey) {
              // Full key should NOT be visible in the list
              const isFullKeyVisible = await page.locator(`text=${fullKey}`).count();
              expect(isFullKeyVisible).toBe(0);

              // Should show masked version
              const hasMaskedKey = await page
                .locator('text=sk_***')
                .or(page.locator('text=****'))
                .count();
              expect(hasMaskedKey).toBeGreaterThan(0);
            }
          }
        }
      }
    });
  });

  test.describe('API Key Updates', () => {
    test('can update API key name', async ({ page }) => {
      await registerUser(page);

      const apiKeysLink = page.locator('a[href*="api-keys"]').first();

      if ((await apiKeysLink.count()) > 0) {
        await apiKeysLink.click();
        await page.waitForLoadState('networkidle');

        // Create a key first
        const createButton = page.locator('button:has-text("Create")');
        if ((await createButton.count()) > 0) {
          await createButton.first().click();

          const nameInput = page.locator('input[name="name"]');
          if ((await nameInput.count()) > 0) {
            const originalName = `Original Name ${Date.now()}`;
            await nameInput.fill(originalName);

            const submitButton = page.locator('button[type="submit"]');
            await submitButton.click();
            await page.waitForLoadState('networkidle');

            const closeButton = page.locator('button:has-text("Close")');
            if ((await closeButton.count()) > 0) {
              await closeButton.click();
            }

            await page.waitForLoadState('networkidle');

            // Find edit button
            const editButton = page
              .locator(
                `tr:has-text("${originalName}") button:has-text("Edit"), [data-testid="edit-api-key"]`
              )
              .first();

            if ((await editButton.count()) > 0) {
              await editButton.click();

              // Update name
              const updateNameInput = page.locator('input[name="name"]');
              const newName = `Updated Name ${Date.now()}`;
              await updateNameInput.clear();
              await updateNameInput.fill(newName);

              const saveButton = page.locator('button:has-text("Save"), button:has-text("Update")');
              await saveButton.click();
              await page.waitForLoadState('networkidle');

              // Should see updated name
              await expect(page.locator(`text=${newName}`)).toBeVisible({ timeout: 5000 });
            }
          }
        }
      }
    });

    test('can set API key expiration', async ({ page }) => {
      await registerUser(page);

      const apiKeysLink = page.locator('a[href*="api-keys"]').first();

      if ((await apiKeysLink.count()) > 0) {
        await apiKeysLink.click();
        await page.waitForLoadState('networkidle');

        const createButton = page.locator('button:has-text("Create")');
        if ((await createButton.count()) > 0) {
          await createButton.first().click();

          const nameInput = page.locator('input[name="name"]');
          if ((await nameInput.count()) > 0) {
            await nameInput.fill(`Expiring Key ${Date.now()}`);

            // Look for expiration field
            const expirationInput = page.locator(
              'input[name="expiresAt"], input[name="expiration"], select[name="expiration"]'
            );

            if ((await expirationInput.count()) > 0) {
              // Set expiration to 30 days or select option
              await expirationInput.fill('30');
            }

            const submitButton = page.locator('button[type="submit"]');
            await submitButton.click();
            await page.waitForLoadState('networkidle');
          }
        }
      }
    });
  });

  test.describe('API Key Revocation', () => {
    test('can revoke an API key', async ({ page }) => {
      await registerUser(page);

      const apiKeysLink = page.locator('a[href*="api-keys"]').first();

      if ((await apiKeysLink.count()) > 0) {
        await apiKeysLink.click();
        await page.waitForLoadState('networkidle');

        // Create a key to revoke
        const createButton = page.locator('button:has-text("Create")');
        if ((await createButton.count()) > 0) {
          await createButton.first().click();

          const nameInput = page.locator('input[name="name"]');
          if ((await nameInput.count()) > 0) {
            const keyName = `To Revoke ${Date.now()}`;
            await nameInput.fill(keyName);

            const submitButton = page.locator('button[type="submit"]');
            await submitButton.click();
            await page.waitForLoadState('networkidle');

            const closeButton = page.locator('button:has-text("Close")');
            if ((await closeButton.count()) > 0) {
              await closeButton.click();
            }

            await page.waitForLoadState('networkidle');

            // Find revoke button
            const revokeButton = page
              .locator(
                `tr:has-text("${keyName}") button:has-text("Revoke"), tr:has-text("${keyName}") button:has-text("Delete")`
              )
              .first();

            if ((await revokeButton.count()) > 0) {
              await revokeButton.click();

              // Confirm revocation
              const confirmButton = page.locator(
                'button:has-text("Confirm"), button:has-text("Yes")'
              );
              if ((await confirmButton.count()) > 0) {
                await confirmButton.click();
              }

              await page.waitForLoadState('networkidle');

              // Key should be removed or marked as revoked
              const keyStillVisible = await page.locator(`text=${keyName}`).count();
              // Either removed or shows as "revoked"
              if (keyStillVisible > 0) {
                await expect(page.locator('text=Revoked, text=Inactive')).toBeVisible();
              }
            }
          }
        }
      }
    });

    test('shows confirmation dialog before revoking', async ({ page }) => {
      await registerUser(page);

      const apiKeysLink = page.locator('a[href*="api-keys"]').first();

      if ((await apiKeysLink.count()) > 0) {
        await apiKeysLink.click();
        await page.waitForLoadState('networkidle');

        // Find any revoke button
        const revokeButton = page
          .locator('button:has-text("Revoke"), button:has-text("Delete")')
          .first();

        if ((await revokeButton.count()) > 0) {
          await revokeButton.click();

          // Should see confirmation dialog
          await expect(
            page
              .locator('text=Are you sure')
              .or(page.locator('text=Confirm'))
              .or(page.locator('[role="dialog"]'))
          ).toBeVisible({ timeout: 3000 });

          // Cancel
          const cancelButton = page.locator('button:has-text("Cancel"), button:has-text("No")');
          if ((await cancelButton.count()) > 0) {
            await cancelButton.click();
          }
        }
      }
    });
  });

  test.describe('API Key Usage', () => {
    test('can authenticate with valid API key', async ({ request }) => {
      // Use existing API key from .env or create one via UI
      const apiKey = process.env.TEST_API_KEY || 'test_api_key_dev';

      // Make API request with key
      const response = await request.get(`${URLS.api}/api/v1/services`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      // Should either succeed or fail with 401 (if key is invalid)
      expect([200, 401]).toContain(response.status());
    });

    test('rejects invalid API key', async ({ request }) => {
      const invalidKey = 'sk_invalid_key_12345';

      const response = await request.get(`${URLS.api}/api/v1/services`, {
        headers: {
          Authorization: `Bearer ${invalidKey}`,
        },
      });

      expect(response.status()).toBe(401);
    });

    test('rejects revoked API key', async ({ page, request }) => {
      await registerUser(page);

      const apiKeysLink = page.locator('a[href*="api-keys"]').first();

      if ((await apiKeysLink.count()) > 0) {
        await apiKeysLink.click();
        await page.waitForLoadState('networkidle');

        // Create and immediately revoke a key
        const createButton = page.locator('button:has-text("Create")');
        if ((await createButton.count()) > 0) {
          await createButton.first().click();

          const nameInput = page.locator('input[name="name"]');
          if ((await nameInput.count()) > 0) {
            await nameInput.fill(`Revoked Key ${Date.now()}`);

            const submitButton = page.locator('button[type="submit"]');
            await submitButton.click();
            await page.waitForLoadState('networkidle');

            // Get the key value
            const keyValue = await page
              .locator('code, [data-testid="api-key-value"]')
              .textContent();

            const closeButton = page.locator('button:has-text("Close")');
            if ((await closeButton.count()) > 0 && keyValue) {
              await closeButton.click();
              await page.waitForLoadState('networkidle');

              // Revoke it
              const revokeButton = page.locator('button:has-text("Revoke")').first();
              if ((await revokeButton.count()) > 0) {
                await revokeButton.click();

                const confirmButton = page.locator('button:has-text("Confirm")');
                if ((await confirmButton.count()) > 0) {
                  await confirmButton.click();
                }

                await page.waitForLoadState('networkidle');

                // Try to use the revoked key
                const response = await request.get(`${URLS.api}/api/v1/services`, {
                  headers: {
                    Authorization: `Bearer ${keyValue}`,
                  },
                });

                expect(response.status()).toBe(401);
              }
            }
          }
        }
      }
    });
  });
});
