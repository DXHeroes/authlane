import { expect, test } from '@playwright/test';

test('debug registration flow', async ({ page }) => {
  const logs: string[] = [];
  const errors: string[] = [];

  page.on('console', (msg) => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', (err) => {
    errors.push(`[PAGE ERROR] ${err.message}`);
  });

  // Monitor network requests
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/auth')) {
      const status = response.status();
      let body = '';
      try {
        body = await response.text();
      } catch (e) {
        body = '<unable to read>';
      }
      console.log(`API Response: ${url} - Status: ${status}`);
      console.log(`Body: ${body.substring(0, 200)}`);
    }
  });

  await page.goto('http://localhost:5173/register');
  await page.waitForLoadState('networkidle');

  // Fill registration form
  const testEmail = `test-${Date.now()}@example.com`;
  await page.fill('input[name="name"]', 'Test Org');
  await page.fill('input[name="email"]', testEmail);
  await page.fill('input[name="password"]', 'TestPassword123!');

  console.log('Submitting registration form...');
  await page.click('button[type="submit"]');

  // Wait a bit
  await page.waitForTimeout(5000);

  console.log('\n=== CONSOLE LOGS ===');
  logs.forEach((log) => console.log(log));

  if (errors.length > 0) {
    console.log('\n=== ERRORS ===');
    errors.forEach((err) => console.log(err));
  }

  console.log('\n=== FINAL URL ===');
  console.log(page.url());

  const bodyText = await page.locator('body').textContent();
  console.log('\n=== BODY TEXT ===');
  console.log(bodyText?.substring(0, 300));

  expect(true).toBeTruthy(); // Always pass
});
