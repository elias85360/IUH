// E2E scaffold using Playwright Test. Disabled by default in CI.
// To enable locally: in frontend/, run `npx playwright install` then `npx playwright test`.

import { test, expect } from '@playwright/test'

test.describe('IoT Dashboard smoke', () => {
  test.skip(true, 'Enable when dev server is running and browsers are installed')

  test('home loads and shows button', async ({ page }) => {
    await page.goto(process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5174')
    await expect(page.getByRole('button', { name: /Charger les données|Chargement|Données chargées/ })).toBeVisible()
  })
})

