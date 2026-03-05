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

    // Wait for redirect to the main dash (also reject auth error pages)
    await page.waitForURL(
        (url) => !url.pathname.includes('/login') && !url.pathname.includes('/api/auth/error'),
        { timeout: 15_000 }
    );

    // Give the session cookie time to be fully set
    await page.waitForTimeout(2000);

    // Verify the session cookie exists before saving state
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(c => c.name.includes('authjs.session-token'));
    if (!sessionCookie) {
        console.warn('WARNING: No session cookie found after login');
    }

    // Persist state
    await page.context().storageState({ path: AUTH_FILE });
});
