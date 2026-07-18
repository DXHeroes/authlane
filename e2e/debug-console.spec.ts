import { expect, test } from '@playwright/test';

test('debug console logs', async ({ page }) => {
  const logs: string[] = [];

  page.on('console', (msg) => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', (err) => {
    logs.push(`[PAGE ERROR] ${err.message}`);
  });

  await page.goto('http://localhost:5173/register');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  console.log('=== BROWSER CONSOLE LOGS ===');
  logs.forEach((log) => {
    console.log(log);
  });

  const bodyText = await page.locator('body').textContent();
  console.log('\n=== BODY TEXT ===');
  console.log(bodyText);

  const rootHTML = await page.locator('#root').innerHTML();
  console.log('\n=== ROOT HTML ===');
  console.log(rootHTML);

  expect(true).toBeTruthy(); // Always pass
});
