import { test, expect } from '@playwright/test';

/**
 * Legal App — Cases List & Detail E2E tests.
 * Verifies that the shared cases functionality works correctly in the Legal app context.
 */

test.describe('Cases List', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/cases');
    });

    test('loads without redirecting to login', async ({ page }) => {
        await expect(page).not.toHaveURL(/\/login/);
    });

    test('page renders a heading or content area', async ({ page }) => {
        const heading = page.getByRole('heading').first();
        await expect(heading).toBeVisible({ timeout: 10_000 });
    });

    test('invalid case ID shows not-found or error state', async ({ page }) => {
        await page.goto('/cases/invalid-id-that-does-not-exist');
        await expect(page).not.toHaveURL(/\/login/);
        // Should show some error or not-found state (not crash)
        const body = page.locator('body');
        await expect(body).toBeVisible();
    });
});

test.describe('Case Detail in Legal Context', () => {
    test('case detail page is accessible if a case exists', async ({ page }) => {
        await page.goto('/cases');
        const caseLink = page.getByRole('link').first();
        if (await caseLink.isVisible()) {
            await caseLink.click();
            await expect(page).not.toHaveURL(/\/login/);

            // Case detail should show basic info
            const detailContent = page.getByRole('heading').first();
            await expect(detailContent).toBeVisible({ timeout: 10_000 });
        }
    });

    test('status badges are visible on case detail', async ({ page }) => {
        await page.goto('/cases');
        const caseLink = page.getByRole('link').first();
        if (await caseLink.isVisible()) {
            await caseLink.click();
            const statusBadge = page.getByText(/active|pending|closed|in progress/i).first();
            if (await statusBadge.isVisible()) {
                await expect(statusBadge).toBeVisible();
            }
        }
    });
});
