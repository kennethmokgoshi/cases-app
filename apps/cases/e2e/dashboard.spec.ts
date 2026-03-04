import { test, expect } from '@playwright/test';

/**
 * Dashboard & Navigation E2E Test
 * 
 * Verifies that the dashboard summary widgets and search features work correctly.
 */

test.describe('Dashboard & Searching', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('loads summary widgets with data', async ({ page }) => {
        // Verify key performance indicators load (actual dashboard shows division cards)
        await expect(page.getByText(/insurance division|active cases|active policies/i)).toBeVisible();

        // Check if chart containers are present
        const charts = page.locator('canvas, svg');
        await expect(charts.first()).toBeVisible();
    });

    test('search filters the cases list', async ({ page }) => {
        // 1. Get a name that exists
        const firstRow = page.locator('tbody tr').first();
        const name = await firstRow.locator('td').nth(1).innerText();

        // 2. Search for it
        const searchInput = page.getByPlaceholder(/search|find/i);
        await searchInput.fill(name);
        await page.keyboard.press('Enter');

        // 3. Verify only relevant results show
        await page.waitForTimeout(1000); // Wait for debounce
        const rows = page.locator('tbody tr');
        const count = await rows.count();

        for (let i = 0; i < count; i++) {
            const text = await rows.nth(i).innerText();
            expect(text.toLowerCase()).toContain(name.toLowerCase());
        }
    });

    test('navigation between apps (multi-app check)', async ({ page }) => {
        // Test clicking an app switcher or external link
        const appSwitcher = page.getByRole('button', { name: /apps|switch/i });
        if (await appSwitcher.isVisible()) {
            await appSwitcher.click();
            await expect(page.getByText(/insurance|legal|finance/i)).toBeVisible();
        }
    });
});
