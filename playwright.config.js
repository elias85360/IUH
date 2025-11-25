const { defineConfig } = require('@playwright/test')

const baseURL = process.env.E2E_BASE_URL || 'http://localhost'

module.exports = defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  outputDir: 'playwright-results',
  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report' }]],
})
 
