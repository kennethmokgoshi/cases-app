import { test as setup, expect } from '@playwright/test';
import path from 'path';

/**
 * Global authentication setup for Forensic Audit E2E tests.
 * Logs in once and saves auth state to .auth/user.json for reuse across all tests.
 */

const AUTH_FILE = path.join(__dirname, '.auth/user.json');

setup('authenticate', async ({ page }) => {
    const email = process.env.E2E_EMAIL;
    const password = process.env.E2E_PASSWORD;

    if (!email || !password) {
        throw new Error(
            'E2E_EMAIL and E2E_PASSWORD must be set in your environment before running E2E tests.'
        );
    }

    await page.goto('/login');
    await expect(page).toHaveTitle(/ZENOWETHU|Zenowethu|Forensic/i);

    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /sign in|login/i }).click();

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });

    await page.context().storageState({ path: AUTH_FILE });
});
