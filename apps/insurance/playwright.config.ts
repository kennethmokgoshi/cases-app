import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration for the Zenowethu Insurance app.
 * Tests run against port 3002.
 */

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3001';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: process.env.CI ? 'github' : 'list',

    use: {
        baseURL: BASE_URL,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure'
    },

    projects: [
        {
            name: 'setup',
            testMatch: /global\.setup\.ts/
        },
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                storageState: 'e2e/.auth/user.json'
            },
            dependencies: ['setup']
        },
    ],

    webServer: {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
    }
});
