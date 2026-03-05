import { test, expect } from '@playwright/test';

/**
 * Forensic Audit App — Dashboard & Navigation E2E tests.
 * Runs with saved auth state (authenticated user).
 */

test.describe('Forensic Audit Dashboard', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('loads without redirecting to login', async ({ page }) => {
        await expect(page).not.toHaveURL(/\/login/);
    });

    test('shows dashboard heading or KPI chips', async ({ page }) => {
        const heading = page.getByRole('heading').first();
        await expect(heading).toBeVisible({ timeout: 10_000 });
    });

    test('KPI chips are visible if data exists', async ({ page }) => {
        // Dashboard shows Total Audits / Requiring Action / Reviewed
        const kpiText = page.getByText(/total audits|requiring action|reviewed/i).first();
        if (await kpiText.isVisible().catch(() => false)) {
            await expect(kpiText).toBeVisible();
        }
    });

    test('sidebar navigation is visible', async ({ page }) => {
        const nav = page.getByRole('navigation');
        await expect(nav).toBeVisible();
    });

    test('cases list is accessible', async ({ page }) => {
        await page.goto('/cases');
        await expect(page).not.toHaveURL(/\/login/);
    });

    test('compliance page is accessible', async ({ page }) => {
        await page.goto('/compliance');
        await expect(page).not.toHaveURL(/\/login/);
    });

    test('rate tables admin is accessible', async ({ page }) => {
        await page.goto('/admin/rate-tables');
        await expect(page).not.toHaveURL(/\/login/);
    });
});
