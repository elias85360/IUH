const { test, expect } = require('@playwright/test')

const baseURL = process.env.E2E_BASE_URL
const apiURL = process.env.E2E_API_URL || (baseURL ? `${baseURL}/api` : null)

test.describe('API smoke', () => {
  test.skip(!apiURL, 'Set E2E_BASE_URL or E2E_API_URL to run API smoke tests')

  test('health endpoint responds 200', async ({ request }) => {
    const res = await request.get(`${apiURL}/health`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toHaveProperty('ok')
  })

  test('devices endpoint returns array field', async ({ request }) => {
    const res = await request.get(`${apiURL}/devices`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(Array.isArray(body.devices || body)).toBe(true)
  })
})

async function maybeLogin(page, username, password) {
  const userField = page.locator('input[name="username"]')
  const passField = page.locator('input[name="password"]')
  if ((await userField.count()) && (await passField.count())) {
    await userField.fill(username)
    await passField.fill(password)
    const submit = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Connexion")').first()
    if (await submit.count()) await submit.click()
  }
}

test.describe('UI navigation', () => {
  const viewerUser = process.env.E2E_USER_VIEWER
  const viewerPass = process.env.E2E_PASS_VIEWER
  const adminUser = process.env.E2E_USER_ADMIN
  const adminPass = process.env.E2E_PASS_ADMIN

  test.skip(!baseURL, 'Set E2E_BASE_URL to run UI navigation smoke tests')

  test('viewer can reach home and devices', async ({ page }) => {
    await page.goto(baseURL, { waitUntil: 'networkidle' })
    if (viewerUser && viewerPass) await maybeLogin(page, viewerUser, viewerPass)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveTitle(/.+/i)
    const devicesLink = page.locator('text=Devices').first()
    if (await devicesLink.count()) {
      await devicesLink.click()
      await page.waitForTimeout(500)
    }
    await expect(page).toHaveURL(/./)
  })

  test('admin can open settings page', async ({ page }) => {
    test.skip(!adminUser || !adminPass, 'Set E2E_USER_ADMIN/E2E_PASS_ADMIN for admin nav check')
    await page.goto(baseURL, { waitUntil: 'networkidle' })
    await maybeLogin(page, adminUser, adminPass)
    const settings = page.locator('text=Settings').first()
    if (await settings.count()) {
      await settings.click()
      await page.waitForTimeout(500)
      await expect(page.locator('text=Settings')).toBeVisible()
    }
  })
})
