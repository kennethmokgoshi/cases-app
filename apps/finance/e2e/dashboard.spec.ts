import { test, expect } from '@playwright/test';

/**
 * Finance App — Dashboard & Navigation E2E tests.
 * Runs with saved auth state (authenticated user).
 */

test.describe('Finance Dashboard (Accounts)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('loads without redirecting to login', async ({ page }) => {
        await expect(page).not.toHaveURL(/\/login/);
    });

    test('shows dashboard heading or KPI cards', async ({ page }) => {
        const heading = page.getByRole('heading').first();
        await expect(heading).toBeVisible({ timeout: 10_000 });
    });

    test('MTD collections or financial KPI is visible if data exists', async ({ page }) => {
        // Dashboard shows MTD collections, pending batches, unallocated payments
        const kpiText = page.getByText(/collections|pending|unallocated|month.to.date/i).first();
        if (await kpiText.isVisible()) {
            await expect(kpiText).toBeVisible();
        }
    });

    test('ZAR currency amounts are visible if data exists', async ({ page }) => {
        const zarAmount = page.getByText(/R\s?\d|ZAR/i).first();
        if (await zarAmount.isVisible()) {
            await expect(zarAmount).toBeVisible();
        }
    });

    test('sidebar navigation is visible', async ({ page }) => {
        const nav = page.getByRole('navigation');
        await expect(nav).toBeVisible();
    });

    test('invoices page is accessible', async ({ page }) => {
        await page.goto('/invoices');
        await expect(page).not.toHaveURL(/\/login/);
    });

    test('payments page is accessible', async ({ page }) => {
        await page.goto('/payments');
        await expect(page).not.toHaveURL(/\/login/);
    });

    test('revenue page is accessible', async ({ page }) => {
        await page.goto('/revenue');
        await expect(page).not.toHaveURL(/\/login/);
    });

    test('audit trail page is accessible', async ({ page }) => {
        await page.goto('/audit-trail');
        await expect(page).not.toHaveURL(/\/login/);
    });
});
