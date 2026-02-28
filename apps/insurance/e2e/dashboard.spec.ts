import { test, expect } from '@playwright/test';

/**
 * Insurance App — Dashboard & Navigation E2E tests.
 * Runs with saved auth state (authenticated user).
 */

test.describe('Insurance Dashboard', () => {
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
        // All apps share the same Sidebar component
        const nav = page.getByRole('navigation');
        await expect(nav).toBeVisible();
    });

    test('cases list is accessible via navigation', async ({ page }) => {
        await page.goto('/cases');
        await expect(page).not.toHaveURL(/\/login/);
    });

    test('assessments list is accessible', async ({ page }) => {
        await page.goto('/assessments');
        await expect(page).not.toHaveURL(/\/login/);
    });

    test('underwriting queue is accessible', async ({ page }) => {
        await page.goto('/underwriting');
        await expect(page).not.toHaveURL(/\/login/);
    });
});
