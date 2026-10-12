import { defineConfig, devices } from '@playwright/test';

/**
 * Runs against an already-running app (local `npm run dev` + backend, or the deployed URL):
 *   E2E_BASE_URL=https://your-app.vercel.app npm run e2e
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000, // the first request to a sleeping free-tier backend can take about a minute
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
