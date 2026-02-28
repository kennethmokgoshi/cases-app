import { test, expect } from '@playwright/test';

/**
 * Authentication flow E2E tests.
 * These run WITHOUT the saved auth state (unauthenticated tests).
 */

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Login page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
    });

    test('renders the login form', async ({ page }) => {
        await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
        await expect(page.getByLabel('Email Address')).toBeVisible();
        await expect(page.getByLabel('Password')).toBeVisible();
        await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
        await expect(page.getByRole('link', { name: /forgot your password/i })).toBeVisible();
    });

    test('shows error for invalid credentials', async ({ page }) => {
        await page.getByLabel('Email Address').fill('notauser@zenowethu.co.za');
        await page.getByLabel('Password').fill('wrongpassword');
        await page.getByRole('button', { name: /sign in/i }).click();

        await expect(page.getByText(/invalid email or password|email not recognised/i)).toBeVisible({
            timeout: 10_000 });

        // Must stay on login page
        await expect(page).toHaveURL(/\/login/);
    });

    test('shows error for empty email', async ({ page }) => {
        await page.getByLabel('Password').fill('somepassword');
        await page.getByRole('button', { name: /sign in/i }).click();

        // Browser native validation prevents submit; email field should be focused
        const emailInput = page.getByLabel('Email Address');
        await expect(emailInput).toBeFocused();
    });

    test('password toggle shows and hides password text', async ({ page }) => {
        const passwordInput = page.getByLabel('Password');
        await passwordInput.fill('mysecret');

        // Initially hidden
        await expect(passwordInput).toHaveAttribute('type', 'password');

        // Click the eye icon (toggle button inside the password field wrapper)
        await page.locator('button[type="button"]').click();
        await expect(passwordInput).toHaveAttribute('type', 'text');

        // Click again to hide
        await page.locator('button[type="button"]').click();
        await expect(passwordInput).toHaveAttribute('type', 'password');
    });

    test('redirects to forgot password page', async ({ page }) => {
        await page.getByRole('link', { name: /forgot your password/i }).click();
        await expect(page).toHaveURL(/\/forgot-password/);
    });

    test('unauthenticated access to dashboard redirects to login', async ({ page }) => {
        await page.goto('/');
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
        await page.getByLabel('Email Address').fill(email!);
        await page.getByLabel('Password').fill(password!);
        await page.getByRole('button', { name: /sign in/i }).click();

        await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });
        expect(page.url()).not.toContain('/login');
    });
});
