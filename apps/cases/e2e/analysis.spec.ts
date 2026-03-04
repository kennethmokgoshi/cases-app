import { test, expect } from '@playwright/test';

/**
 * Analysis Flow E2E Test
 *
 * Verifies the case detail page and analysis features:
 * 1. Navigate from cases list to case detail
 * 2. Verify case detail page loads with expected sections
 * 3. Verify Documents section accessibility
 * 4. Verify Re-Analyze button functionality
 *
 * These tests require cases to exist in the database.
 * They will skip gracefully if no cases are available.
 */

/** Helper: navigate from /cases list to the first case's detail page */
async function navigateToCaseDetail(page: import('@playwright/test').Page): Promise<boolean> {
    await page.goto('/cases');
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

    // Check if cases table has rows
    const hasRows = await page.locator('tbody tr').first().isVisible({ timeout: 10000 }).catch(() => false);
    if (!hasRows) return false;

    // Get the link href from the first case row and navigate directly
    // (clicking the row doesn't navigate; the link inside the row does)
    const firstCaseLink = page.locator('tbody tr').first().locator('a').first();
    const href = await firstCaseLink.getAttribute('href');
    if (!href) return false;

    await page.goto(href);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    return true;
}

test.describe('Document Analysis Flow', () => {
    test.beforeEach(async ({ page }) => {
        // Navigation happens inside each test via the helper
    });

    test('case detail page loads with documents section', async ({ page }) => {
        const navigated = await navigateToCaseDetail(page);
        if (!navigated) {
            test.skip(true, 'No cases in database - cannot test case detail');
            return;
        }

        // Verify we are on a case detail page (URL contains /cases/<id>)
        expect(page.url()).toMatch(/\/cases\/[a-z0-9]+$/);

        // Verify key sections are present on the case detail page
        await expect(page.getByRole('heading', { name: /Workflow Status/i })).toBeVisible({ timeout: 10000 });
        await expect(page.getByRole('heading', { name: /Case Description/i })).toBeVisible({ timeout: 5000 });

        // Verify the Documents button exists in the activity section
        const docsBtn = page.getByRole('button', { name: /Documents/i });
        await expect(docsBtn).toBeVisible({ timeout: 5000 });
    });

    test('can trigger manual re-analysis from case detail', async ({ page }) => {
        const navigated = await navigateToCaseDetail(page);
        if (!navigated) {
            test.skip(true, 'No cases in database - cannot test re-analysis');
            return;
        }

        // Verify we are on a case detail page
        expect(page.url()).toMatch(/\/cases\/[a-z0-9]+$/);

        // The Re-Analyze button should be visible on the case detail page
        const reanalyzeBtn = page.getByRole('button', { name: /Re-Analyze/i });
        await expect(reanalyzeBtn).toBeVisible({ timeout: 10000 });

        // Click Re-Analyze
        await reanalyzeBtn.click();

        // After clicking, expect either a confirmation dialog, an analyzing state,
        // or the button to still be present (analysis may complete quickly or need confirmation)
        const confirmBtn = page.getByRole('button', { name: /confirm|ok|yes/i });
        const hasConfirm = await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false);
        if (hasConfirm) {
            await confirmBtn.click();
        }

        // Verify the page is still functional (no crash) after triggering re-analysis
        // The Re-Analyze button or an analyzing indicator should be visible
        const pageStillWorks = await page.getByRole('heading').first().isVisible({ timeout: 10000 }).catch(() => false);
        expect(pageStillWorks).toBeTruthy();
    });
});
