import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 *
 * Run all tests: pnpm test:e2e
 * Run with UI: pnpm test:e2e --ui
 * Run specific test: pnpm test:e2e e2e/auth.spec.ts
 *
 * Test categories:
 * - smoke.spec.ts - Basic health checks
 * - auth.spec.ts - Authentication flows
 * - organization.spec.ts - Organization management
 * - services.spec.ts - Service management
 * - example-saas.spec.ts - Example SaaS app integration
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Run tests sequentially for auth flows
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1, // Single worker for auth state consistency
  reporter: [['html'], ['list']],

  // Increase timeout for E2E tests
  timeout: 60000,
  expect: {
    timeout: 10000,
  },

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Increase navigation timeout
    navigationTimeout: 30000,
    actionTimeout: 15000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Don't auto-start servers - user should run `pnpm dev` first
  // webServer: { ... }
});
