import { test, expect } from '@playwright/test';

/**
 * Legal App — Dashboard & Navigation E2E tests.
 * Runs with saved auth state (authenticated user).
 */

test.describe('Legal Dashboard', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('loads without redirecting to login', async ({ page }) => {
        await expect(page).not.toHaveURL(/\/login/);
    });

    test('shows at least one dashboard heading or KPI', async ({ page }) => {
        const heading = page.getByRole('heading').first();
        await expect(heading).toBeVisible({ timeout: 10_000 });
    });

    test('sidebar navigation is visible', async ({ page }) => {
        const nav = page.getByRole('navigation');
        await expect(nav).toBeVisible();
    });

    test('cases list is accessible', async ({ page }) => {
        await page.goto('/cases');
        await expect(page).not.toHaveURL(/\/login/);
    });

    test('agreements list is accessible', async ({ page }) => {
        await page.goto('/agreements');
        await expect(page).not.toHaveURL(/\/login/);
    });

    test('reports page is accessible', async ({ page }) => {
        await page.goto('/reports');
        await expect(page).not.toHaveURL(/\/login/);
    });
});
