import { test, expect } from '@playwright/test';

/**
 * Authentication flow E2E tests for the Forensic Audit app.
 * Runs WITHOUT saved auth state (unauthenticated tests).
 */

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Login page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
    });

    test('renders the login form', async ({ page }) => {
        await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
        await expect(page.getByLabel(/email/i)).toBeVisible();
        await expect(page.getByLabel(/password/i)).toBeVisible();
        await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    });

    test('shows error for invalid credentials', async ({ page }) => {
        await page.getByLabel(/email/i).fill('notauser@zenowethu.co.za');
        await page.getByLabel(/password/i).fill('wrongpassword');
        await page.getByRole('button', { name: /sign in/i }).click();

        await expect(page.getByText(/invalid email or password|email not recognised/i)).toBeVisible({
            timeout: 10_000,
        });
        await expect(page).toHaveURL(/\/login/);
    });

    test('shows validation for empty email', async ({ page }) => {
        await page.getByLabel(/password/i).fill('somepassword');
        await page.getByRole('button', { name: /sign in/i }).click();
        const emailInput = page.getByLabel(/email/i);
        await expect(emailInput).toBeFocused();
    });

    test('unauthenticated access to dashboard redirects to login', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveURL(/\/login/);
    });

    test('unauthenticated access to compliance redirects to login', async ({ page }) => {
        await page.goto('/compliance');
        await expect(page).toHaveURL(/\/login/);
    });

    test('unauthenticated access to rate tables redirects to login', async ({ page }) => {
        await page.goto('/admin/rate-tables');
        await expect(page).toHaveURL(/\/login/);
    });
});

test.describe('Authenticated session', () => {
    test('successful login redirects away from /login', async ({ page }) => {
        const email = process.env.E2E_EMAIL;
        const password = process.env.E2E_PASSWORD;

        if (!email || !password) {
            test.skip(true, 'E2E_EMAIL and E2E_PASSWORD not set — skipping live login test');
        }

        await page.goto('/login');
        await page.getByLabel(/email/i).fill(email!);
        await page.getByLabel(/password/i).fill(password!);
        await page.getByRole('button', { name: /sign in/i }).click();

        await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });
        expect(page.url()).not.toContain('/login');
    });
});
