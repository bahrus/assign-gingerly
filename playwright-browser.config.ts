import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for running tests in actual browser JavaScript engines.
 * This configuration opens HTML test pages in real browsers instead of running
 * tests in Node.js.
 */
export default defineConfig({
  testDir: './tests-browser',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  
  use: {
    baseURL: 'http://localhost:8000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // Start local web server before running tests
  webServer: {
    command: 'npm run serve',
    port: 8000,
    reuseExistingServer: !process.env.CI,
  },
});
