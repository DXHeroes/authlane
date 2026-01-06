import { expect, test } from '@playwright/test';

test('debug registration flow in detail', async ({ page }) => {
  const logs: string[] = [];
  const apiCalls: Array<{ url: string; status: number; body: string }> = [];

  page.on('console', (msg) => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });

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
      apiCalls.push({ url, status, body });
    }
  });

  await page.goto('http://localhost:5173/register');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000); // Wait for React to hydrate

  // Fill registration form
  const testEmail = `test-${Date.now()}@example.com`;
  console.log(`\nTesting with email: ${testEmail}`);

  await page.fill('input[name="name"]', 'Test Org');
  await page.fill('input[name="email"]', testEmail);
  await page.fill('input[name="password"]', 'TestPassword123!');

  console.log('Clicking submit button...');
  await page.click('button[type="submit"]');

  // Wait and observe
  await page.waitForTimeout(5000);

  console.log('\n=== API CALLS ===');
  apiCalls.forEach((call) => {
    console.log(`\n${call.url}`);
    console.log(`Status: ${call.status}`);
    console.log(`Body: ${call.body.substring(0, 300)}`);
  });

  console.log('\n=== CONSOLE LOGS (filtered for auth) ===');
  logs.filter((log) => log.includes('Auth')).forEach((log) => console.log(log));

  console.log(`\n=== CURRENT URL ===`);
  console.log(page.url());

  // Check if error message is visible
  const errorVisible = await page.locator('[class*="error"], [class*="destructive"]').count();
  if (errorVisible > 0) {
    const errorText = await page
      .locator('[class*="error"], [class*="destructive"]')
      .first()
      .textContent();
    console.log(`\n=== ERROR MESSAGE ===`);
    console.log(errorText);
  }

  // Check button state
  const buttonText = await page.locator('button[type="submit"]').textContent();
  console.log(`\n=== BUTTON TEXT ===`);
  console.log(buttonText);

  expect(true).toBeTruthy(); // Always pass
});
