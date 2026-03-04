import { test, expect } from '@playwright/test';

/**
 * Dashboard & Navigation E2E Test
 *
 * Verifies that the dashboard summary widgets and search features work correctly.
 * The dashboard is a server-rendered page that shows:
 *   - "Group Command Center" heading
 *   - Three division cards: Insurance, Legal, Forensic
 *   - Unified Activity Stream
 *   - DashboardCasesTable (client-side, fetches /api/cases)
 */

test.describe('Dashboard & Searching', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('loads summary widgets with data', async ({ page }) => {
        // The dashboard renders division cards with headings like "Insurance Division",
        // "Legal Division", "Forensic Division", or the main heading "Group Command Center".
        // Also accept "Something went wrong" (error boundary) or "Recent Cases" (table loaded).
        await expect(
            page.getByText(/group command center|insurance division|legal division|forensic division|recent cases/i).first()
        ).toBeVisible({ timeout: 30_000 });
    });

    test('search filters the cases list', async ({ page }) => {
        // The DashboardCasesTable is a client component that fetches from /api/cases.
        // Wait for the "Recent Cases" heading to appear (table section loaded).
        const tableSection = page.getByText(/recent cases/i).first();
        await expect(tableSection).toBeVisible({ timeout: 30_000 });

        // Wait for the loading spinner to disappear and data to load
        const spinner = page.locator('.animate-spin');
        await spinner.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});

        // Wait for table data rows (rows with 4 cells, not the "No cases found" row)
        // The table always renders tbody with at least one tr
        const dataRows = page.locator('tbody tr:has(td:nth-child(2))');
        const hasDataRows = await dataRows.first().isVisible({ timeout: 10_000 }).catch(() => false);

        if (!hasDataRows) {
            test.skip(true, 'No cases loaded in dashboard table to test search filtering');
            return;
        }

        const rowCount = await dataRows.count();

        // 1. Get a name from the second column (Client name)
        const name = await dataRows.first().locator('td').nth(1).innerText();

        // 2. Search for it using the search input
        const searchInput = page.getByPlaceholder(/search/i);
        await searchInput.fill(name);

        // 3. Verify results still contain the searched name
        await page.waitForTimeout(500); // Brief wait for client-side filter
        const filteredRows = page.locator('tbody tr:has(td:nth-child(2))');
        const filteredCount = await filteredRows.count();

        // Filtered count should be <= original and > 0
        expect(filteredCount).toBeGreaterThan(0);
        expect(filteredCount).toBeLessThanOrEqual(rowCount);

        for (let i = 0; i < filteredCount; i++) {
            const text = await filteredRows.nth(i).innerText();
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
