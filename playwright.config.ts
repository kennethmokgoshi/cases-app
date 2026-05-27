import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'cases',
      use: { 
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3000',
      },
      testMatch: /cases\/.*\.spec\.ts/,
    },
    {
      name: 'credo',
      use: { 
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3005',
      },
      testMatch: /credo\/.*\.spec\.ts/,
    },
  ],
});
