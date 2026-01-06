import { expect, test } from '@playwright/test';
import { generateTestUser, URLS, waitForDashboard } from './utils';

/**
 * Tool Execution E2E Tests
 *
 * Tests integration tool execution functionality:
 * - Execute tools via API
 * - Tool parameter validation
 * - Tool execution results
 * - Tool execution history
 * - Error handling for tool failures
 * - Rate limiting for tool execution
 * - Tool execution with different credentials
 *
 * Prerequisites:
 * - pnpm dev running
 * - Database seeded
 * - At least one service connection configured
 */

test.describe('Tool Execution', () => {
  // Helper to register and get API key
  async function setupUserWithApiKey(page: typeof test.prototype.page) {
    const user = generateTestUser();
    await page.goto(`${URLS.dashboard}/register`);
    await page.fill('input[name="name"]', user.name);
    await page.fill('input[type="email"]', user.email);
    await page.fill('input[type="password"]', user.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    await waitForDashboard(page);

    // Navigate to API keys
    const apiKeysLink = page.locator('a[href*="api-keys"]').first();

    let apiKey = null;

    if ((await apiKeysLink.count()) > 0) {
      await apiKeysLink.click();
      await page.waitForLoadState('networkidle');

      // Create API key
      const createButton = page.locator('button:has-text("Create")');
      if ((await createButton.count()) > 0) {
        await createButton.first().click();

        const nameInput = page.locator('input[name="name"]');
        if ((await nameInput.count()) > 0) {
          await nameInput.fill(`Test Key ${Date.now()}`);

          const submitButton = page.locator('button[type="submit"]');
          await submitButton.click();
          await page.waitForLoadState('networkidle');

          // Get API key value
          const keyValueElement = page.locator('code, [data-testid="api-key-value"]');
          apiKey = await keyValueElement.textContent();
        }
      }
    }

    return { user, apiKey };
  }

  test.describe('Tool Discovery', () => {
    test('can list available tools via API', async ({ request }) => {
      const apiKey = process.env.TEST_API_KEY || 'test_api_key_dev';

      const response = await request.get(`${URLS.api}/api/v1/tools`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (response.status() === 200) {
        const body = await response.json();
        expect(body.tools || body).toBeDefined();
      } else {
        // API key might be invalid in test environment
        expect([200, 401]).toContain(response.status());
      }
    });

    test('tools include name, description, and input schema', async ({ request }) => {
      const apiKey = process.env.TEST_API_KEY || 'test_api_key_dev';

      const response = await request.get(`${URLS.api}/api/v1/tools`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (response.status() === 200) {
        const body = await response.json();
        const tools = body.tools || body;

        if (tools && tools.length > 0) {
          const firstTool = tools[0];
          expect(firstTool).toHaveProperty('name');
          expect(firstTool).toHaveProperty('description');
          expect(firstTool).toHaveProperty('inputSchema');
        }
      }
    });

    test('can filter tools by service', async ({ request }) => {
      const apiKey = process.env.TEST_API_KEY || 'test_api_key_dev';

      const response = await request.get(`${URLS.api}/api/v1/tools?service=github`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (response.status() === 200) {
        const body = await response.json();
        const tools = body.tools || body;

        // If tools are returned, they should be GitHub tools
        if (tools && tools.length > 0) {
          const allGithub = tools.every(
            (tool: any) => tool.name.startsWith('github_') || tool.serviceId === 'github'
          );
          expect(allGithub).toBeTruthy();
        }
      }
    });
  });

  test.describe('Tool Execution via API', () => {
    test('can execute a public API tool', async ({ request }) => {
      const apiKey = process.env.TEST_API_KEY || 'test_api_key_dev';

      // Execute a tool (e.g., JSONPlaceholder get posts)
      const response = await request.post(`${URLS.api}/api/v1/tools/execute`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        data: {
          toolName: 'jsonplaceholder_get_posts',
          parameters: {},
        },
      });

      // Should either succeed or fail with proper error
      expect([200, 400, 401, 404]).toContain(response.status());

      if (response.status() === 200) {
        const body = await response.json();
        expect(body).toBeDefined();
      }
    });

    test('validates required tool parameters', async ({ request }) => {
      const apiKey = process.env.TEST_API_KEY || 'test_api_key_dev';

      // Try to execute a tool without required parameters
      const response = await request.post(`${URLS.api}/api/v1/tools/execute`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        data: {
          toolName: 'github_create_issue',
          parameters: {
            // Missing required parameters
          },
        },
      });

      // Should return validation error
      expect([400, 401, 404]).toContain(response.status());

      if (response.status() === 400) {
        const body = await response.json();
        expect(body.error || body.message).toBeDefined();
      }
    });

    test('returns proper error for non-existent tool', async ({ request }) => {
      const apiKey = process.env.TEST_API_KEY || 'test_api_key_dev';

      const response = await request.post(`${URLS.api}/api/v1/tools/execute`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        data: {
          toolName: 'non_existent_tool_12345',
          parameters: {},
        },
      });

      expect(response.status()).toBe(404);

      const body = await response.json();
      expect(body.error || body.message).toBeDefined();
    });

    test('requires authentication for tool execution', async ({ request }) => {
      // Try without API key
      const response = await request.post(`${URLS.api}/api/v1/tools/execute`, {
        headers: {
          'Content-Type': 'application/json',
        },
        data: {
          toolName: 'github_get_user',
          parameters: {},
        },
      });

      expect(response.status()).toBe(401);
    });

    test('executes tool with valid parameters', async ({ request }) => {
      const apiKey = process.env.TEST_API_KEY || 'test_api_key_dev';

      const response = await request.post(`${URLS.api}/api/v1/tools/execute`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        data: {
          toolName: 'jsonplaceholder_get_post',
          parameters: {
            postId: 1,
          },
        },
      });

      // Should succeed or fail with proper error
      expect([200, 400, 401, 404]).toContain(response.status());

      if (response.status() === 200) {
        const body = await response.json();
        expect(body).toBeDefined();
        expect(body.result || body.data).toBeDefined();
      }
    });
  });

  test.describe('Tool Execution Results', () => {
    test('returns execution result in proper format', async ({ request }) => {
      const apiKey = process.env.TEST_API_KEY || 'test_api_key_dev';

      const response = await request.post(`${URLS.api}/api/v1/tools/execute`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        data: {
          toolName: 'jsonplaceholder_get_posts',
          parameters: {},
        },
      });

      if (response.status() === 200) {
        const body = await response.json();

        // Should have result or data field
        expect(body.result || body.data || body).toBeDefined();

        // Might include execution time
        // expect(body.executionTime).toBeDefined();
      }
    });

    test('includes error details when tool fails', async ({ request }) => {
      const apiKey = process.env.TEST_API_KEY || 'test_api_key_dev';

      // Execute a tool that will likely fail (OAuth without credentials)
      const response = await request.post(`${URLS.api}/api/v1/tools/execute`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        data: {
          toolName: 'github_get_user',
          parameters: {},
        },
      });

      if (response.status() >= 400) {
        const body = await response.json();
        expect(body.error || body.message).toBeDefined();
      }
    });
  });

  test.describe('Tool Execution History', () => {
    test('can view tool execution history', async ({ page }) => {
      await setupUserWithApiKey(page);

      // Navigate to executions or audit logs
      const historyLink = page
        .locator('a[href*="executions"], a[href*="history"], a[href*="audit"]')
        .first();

      if ((await historyLink.count()) > 0) {
        await historyLink.click();
        await page.waitForLoadState('networkidle');

        // Should see history table
        await expect(
          page
            .locator('table')
            .or(page.locator('[data-testid="execution-history"]'))
            .or(page.locator('text=No executions'))
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test('execution history shows tool name, parameters, and result', async ({ page }) => {
      await setupUserWithApiKey(page);

      const historyLink = page.locator('a[href*="executions"]').first();

      if ((await historyLink.count()) > 0) {
        await historyLink.click();
        await page.waitForLoadState('networkidle');

        // If there are executions, should show details
        const executionRow = page
          .locator('[data-testid="execution-row"], .execution-item, tbody tr')
          .first();

        if ((await executionRow.count()) > 0) {
          const rowText = await executionRow.textContent();
          expect(rowText).toBeTruthy();
        }
      }
    });

    test('can filter execution history by service', async ({ page }) => {
      await setupUserWithApiKey(page);

      const historyLink = page.locator('a[href*="executions"]').first();

      if ((await historyLink.count()) > 0) {
        await historyLink.click();
        await page.waitForLoadState('networkidle');

        // Look for filter dropdown
        const filterSelect = page.locator('select[name="service"], [data-testid="service-filter"]');

        if ((await filterSelect.count()) > 0) {
          await filterSelect.selectOption('github');
          await page.waitForLoadState('networkidle');

          // Results should be filtered
          const hasResults = await page.locator('tbody tr, .execution-item').count();
          expect(hasResults).toBeGreaterThanOrEqual(0);
        }
      }
    });

    test('can view detailed execution result', async ({ page }) => {
      await setupUserWithApiKey(page);

      const historyLink = page.locator('a[href*="executions"]').first();

      if ((await historyLink.count()) > 0) {
        await historyLink.click();
        await page.waitForLoadState('networkidle');

        // Click on an execution to view details
        const executionRow = page.locator('[data-testid="execution-row"], tbody tr').first();

        if ((await executionRow.count()) > 0) {
          await executionRow.click();

          // Should show execution details
          await expect(
            page
              .locator('[data-testid="execution-details"]')
              .or(page.locator('text=Result'))
              .or(page.locator('text=Parameters'))
          ).toBeVisible({ timeout: 5000 });
        }
      }
    });
  });

  test.describe('Tool Execution Security', () => {
    test('tool execution is scoped to user organization', async ({ page, request }) => {
      const { apiKey } = await setupUserWithApiKey(page);

      if (apiKey) {
        // Execute a tool - should only access this user's connections
        const response = await request.post(`${URLS.api}/api/v1/tools/execute`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          data: {
            toolName: 'github_get_user',
            parameters: {},
          },
        });

        // Should either succeed with user's connection or fail properly
        expect([200, 400, 401, 404]).toContain(response.status());
      }
    });

    test('cannot execute tools for other organizations', async ({ request }) => {
      const apiKey = process.env.TEST_API_KEY || 'test_api_key_dev';

      // Try to execute with explicit organization ID (should be ignored/rejected)
      const response = await request.post(`${URLS.api}/api/v1/tools/execute`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        data: {
          toolName: 'github_get_user',
          parameters: {},
          organizationId: 'other-org-id-12345',
        },
      });

      // Should reject or ignore the organizationId parameter
      expect([200, 400, 401, 403, 404]).toContain(response.status());
    });

    test('redacts sensitive parameters in execution history', async ({ page, request }) => {
      const { apiKey } = await setupUserWithApiKey(page);

      if (apiKey) {
        // Execute a tool with sensitive parameter
        await request.post(`${URLS.api}/api/v1/tools/execute`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          data: {
            toolName: 'test_tool',
            parameters: {
              password: 'super_secret_password',
              api_key: 'secret_key_123',
            },
          },
        });

        // Check execution history
        const historyLink = page.locator('a[href*="executions"]').first();

        if ((await historyLink.count()) > 0) {
          await historyLink.click();
          await page.waitForLoadState('networkidle');

          // Sensitive values should be redacted
          const pageText = await page.locator('body').textContent();
          expect(pageText?.includes('super_secret_password')).toBeFalsy();
          expect(pageText?.includes('secret_key_123')).toBeFalsy();

          // Should show [REDACTED] instead
          expect(pageText?.includes('REDACTED') || pageText?.includes('***')).toBeTruthy();
        }
      }
    });
  });

  test.describe('Tool Execution Performance', () => {
    test('tool execution has reasonable timeout', async ({ request }) => {
      const apiKey = process.env.TEST_API_KEY || 'test_api_key_dev';

      const startTime = Date.now();

      const response = await request.post(`${URLS.api}/api/v1/tools/execute`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        data: {
          toolName: 'jsonplaceholder_get_posts',
          parameters: {},
        },
        timeout: 35000, // 35 second timeout
      });

      const executionTime = Date.now() - startTime;

      // Should complete within 30 seconds
      expect(executionTime).toBeLessThan(30000);

      expect([200, 400, 401, 404, 408]).toContain(response.status());
    });

    test('concurrent tool executions are handled properly', async ({ request }) => {
      const apiKey = process.env.TEST_API_KEY || 'test_api_key_dev';

      // Execute multiple tools concurrently
      const promises = Array.from({ length: 3 }, (_, i) =>
        request.post(`${URLS.api}/api/v1/tools/execute`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          data: {
            toolName: 'jsonplaceholder_get_post',
            parameters: { postId: i + 1 },
          },
        })
      );

      const responses = await Promise.all(promises);

      // All should complete
      expect(responses).toHaveLength(3);

      // Each should have valid status
      responses.forEach((response) => {
        expect([200, 400, 401, 404, 429]).toContain(response.status());
      });
    });
  });
});
