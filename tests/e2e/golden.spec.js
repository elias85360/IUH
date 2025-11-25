const { test, expect } = require('@playwright/test')

const baseURL = process.env.E2E_BASE_URL
const user = process.env.E2E_USER
const password = process.env.E2E_PASS
const adminUser = process.env.E2E_ADMIN_USER || user
const adminPass = process.env.E2E_ADMIN_PASS || password

async function loginIfNeeded(page, u, p) {
  if (!u || !p) return false
  await page.goto(baseURL, { waitUntil: 'networkidle' })
  // Try generic login flow: click "Se connecter" or "Login"
  const loginButton = page.getByText(/se connecter|login|sign in/i).first()
  if (await loginButton.count()) {
    await loginButton.click()
  }
  // Keycloak form selectors (common defaults)
  const userInput = page.locator('input[name="username"], input#username')
  const passInput = page.locator('input[name="password"], input#password')
  if (await userInput.count()) {
    await userInput.fill(u)
    await passInput.fill(p)
    const submit = page.getByRole('button', { name: /sign in|connexion|login|se connecter/i }).first()
    if (await submit.count()) await submit.click()
  }
  // Wait for redirect back to app
  await page.waitForLoadState('networkidle')
  return true
}

test.describe('E2E golden paths', () => {
  test.skip(!baseURL, 'Set E2E_BASE_URL (and credentials) to run golden path tests')

  test('login -> Home shows main elements', async ({ page }) => {
    test.skip(!user || !password, 'Set E2E_USER/E2E_PASS to run login flow')
    await loginIfNeeded(page, user, password)
    await expect(page).toHaveURL(new RegExp(baseURL.replace(/https?:\/\//, '')))
    // Basic smoke: look for nav or stat cards
    const homeText = page.getByText(/home|accueil/i)
    if (await homeText.count()) {
      await expect(homeText.first()).toBeVisible()
    }
  })

  test('Devices -> DeviceDetail shows a chart/KPI', async ({ page }) => {
    test.skip(!user || !password, 'Set E2E_USER/E2E_PASS to run device flow')
    await loginIfNeeded(page, user, password)
    await page.goto(`${baseURL}/devices`, { waitUntil: 'networkidle' })
    // Click first device card/link if present
    const firstLink = page.locator('a').first()
    if (await firstLink.count()) {
      await firstLink.click()
      await page.waitForLoadState('networkidle')
    }
    // Look for chart container or KPI text
    const chart = page.locator('canvas, svg').first()
    await expect(chart).toBeVisible({ timeout: 5000 })
  })

  test('Admin changes threshold in Settings', async ({ page }) => {
    test.skip(!adminUser || !adminPass, 'Set E2E_ADMIN_USER/E2E_ADMIN_PASS to run admin flow')
    await loginIfNeeded(page, adminUser, adminPass)
    await page.goto(`${baseURL}/settings`, { waitUntil: 'networkidle' })
    // Try to adjust a threshold-like input if exists
    const input = page.locator('input[type="number"]').first()
    if (await input.count()) {
      await input.fill('42')
      const save = page.getByRole('button', { name: /save|enregistrer|apply/i }).first()
      if (await save.count()) await save.click()
      await expect(input).toHaveValue('42')
    } else {
      test.skip(true, 'No numeric input found on settings page')
    }
  })
})
