import { expect, test } from '@playwright/test';

const apiClientSelector = '.scalar-app-layout.scalar-client[aria-label="API Client"]';

test('the rendered API reference keeps Scalar authentication and request UI inert', async ({
  page,
}) => {
  await page.goto('http://authlane.localhost:3000/docs/api-reference');
  await expect(page.locator('.authlane-api-reference .scalar-api-reference')).toBeAttached();

  const apiClient = page.locator(apiClientSelector);
  await expect(apiClient).toBeAttached();
  await expect(apiClient).toHaveAttribute('inert', '');
  await expect(apiClient).toHaveAttribute('aria-hidden', 'true');

  const interactiveControls = apiClient.locator('button, input, select, textarea, a[href]');
  expect(await interactiveControls.count()).toBeGreaterThan(0);
  for (const control of await interactiveControls.all()) {
    await expect(control).toHaveAttribute('aria-disabled', 'true');
    await expect(control).toHaveAttribute('tabindex', '-1');
  }
  for (const formControl of await apiClient.locator('button, input, select, textarea').all()) {
    await expect(formControl).toBeDisabled();
  }

  const authenticationBadge = page.locator('.authlane-api-reference .security-requirement-badge');
  await expect(authenticationBadge).toBeAttached();
  await expect(authenticationBadge).toBeDisabled();
  await expect(authenticationBadge).toHaveAttribute('inert', '');
  await expect(authenticationBadge).toHaveAttribute('tabindex', '-1');
});
