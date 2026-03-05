import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

// Load .env.local for E2E credentials (dotenv is optional — only available locally)
try { require('dotenv').config({ path: path.resolve(__dirname, '.env.local') }); } catch {}

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
    testDir: './e2e',
    timeout: 60_000, // 60s per test (increased for slow HDD)
    expect: {
        timeout: 15_000 // 15s for assertions (increased for slow database operations)
    },
    fullyParallel: false, // sequential to avoid session conflicts
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: process.env.CI ? 'github' : 'list',

    use: {
        baseURL: BASE_URL,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure' },

    projects: [
        // Setup project: performs login once and saves auth state
        {
            name: 'setup',
            testMatch: /global\.setup\.ts/ },

        // Main browser — reuses saved auth state
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                storageState: 'e2e/.auth/user.json' },
            dependencies: ['setup'] },
    ],

    // Automatically start the Next.js dev server when running locally
    webServer: {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000 } }); // 5 minutes for slow HDD + large monorepo
