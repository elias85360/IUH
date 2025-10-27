import { test, expect } from '@playwright/test';

test('loads and switches scales, filters, and exports', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Charger les données/i }).click();
  await expect(page.getByText(/devices/i)).toBeVisible();

  // Period switch (multi-échelles)
  const btn24 = page.getByRole('button', { name: /24h/i });
  if (await btn24.isVisible()) await btn24.click();
  const btn7d = page.getByRole('button', { name: /7d/i });
  if (await btn7d.isVisible()) await btn7d.click();

  // Navigate to devices
  const devicesLink = page.getByRole('link', { name: /Devices/i });
  if (await devicesLink.isVisible()) await devicesLink.click();
  await expect(page).toHaveURL(/devices/);

  // Open first device link
  const first = page.locator('a').filter({ hasText: /Device/i }).first();
  if (await first.count()) await first.click();
  await expect(page).toHaveURL(/devices\//);

  // Export buttons exist
  await expect(page.getByRole('button', { name: /Export U \(CSV\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Export P \(JSON\)/ })).toBeVisible();
});
 
