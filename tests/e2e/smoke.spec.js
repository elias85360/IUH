const { test, expect } = require('@playwright/test')
 
const baseURL = process.env.E2E_BASE_URL
const apiURL = process.env.E2E_API_URL || (baseURL ? `${baseURL}/api` : null)

test.describe('API smoke', () => {
  test.skip(!apiURL, 'Set E2E_BASE_URL or E2E_API_URL to run e2e smoke tests')

  test('health endpoint responds', async ({ request }) => {
    const res = await request.get(`${apiURL}/health`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toMatchObject({ status: expect.anything() })
  })

  test('devices and metrics return arrays', async ({ request }) => {
    const devices = await request.get(`${apiURL}/devices`)
    expect(devices.ok()).toBeTruthy()
    const dv = await devices.json()
    expect(Array.isArray(dv)).toBe(true)

    const metrics = await request.get(`${apiURL}/metrics`)
    expect(metrics.ok()).toBeTruthy()
    const mt = await metrics.json()
    expect(Array.isArray(mt)).toBe(true)
  })
})

test.describe('UI smoke', () => {
  test.skip(!baseURL, 'Set E2E_BASE_URL to run UI smoke tests')

  test('home page renders without crash', async ({ page }) => {
    await page.goto(baseURL)
    await page.waitForLoadState('networkidle')
    const html = await page.content()
    expect(html.length).toBeGreaterThan(0)
  })
})
