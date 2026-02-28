import { test as setup, expect } from '@playwright/test';
import path from 'path';

/**
 * Runs once before all test projects.
 * Logs in with the test credentials and saves the browser storage state
 * so authenticated tests don't need to log in every time.
 *
 * Required env vars:
 *   E2E_EMAIL    — test user email
 *   E2E_PASSWORD — test user password
 */

const AUTH_FILE = path.join(__dirname, '.auth/user.json');

setup('authenticate', async ({ page }) => {
    const email = process.env.E2E_EMAIL;
    const password = process.env.E2E_PASSWORD;

    if (!email || !password) {
        throw new Error(
            'E2E_EMAIL and E2E_PASSWORD must be set in your .env or environment before running E2E tests.'
        );
    }

    await page.goto('/login');
    await expect(page).toHaveTitle(/ZENOWETHU|Zenowethu|Cases/i);

    await page.getByLabel('Email Address').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for redirect to the dashboard after successful login
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });

    // Persist auth cookies + localStorage for reuse across tests
    await page.context().storageState({ path: AUTH_FILE });
});
