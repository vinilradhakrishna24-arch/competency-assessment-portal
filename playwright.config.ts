import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a running instance of the app (see README for
 * how to seed a test admin user and a test assessment before running).
 * These are NOT run automatically in CI/CD by default — run with:
 *   npm run test:e2e
 * against a dev server started separately (npm run dev), or point
 * PLAYWRIGHT_BASE_URL at a deployed environment.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
  ],
});
