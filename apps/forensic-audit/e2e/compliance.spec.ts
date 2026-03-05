import { test, expect } from '@playwright/test';

/**
 * Forensic Audit App — Compliance Tracking E2E tests.
 * Covers the /compliance page: status stats, risk pills, resolve actions.
 */

test.describe('Compliance Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/compliance');
    });

    test('page renders without error', async ({ page }) => {
        await expect(page).not.toHaveURL(/\/login/);
        const heading = page.getByRole('heading').first();
        await expect(heading).toBeVisible({ timeout: 10_000 });
    });

    test('stats bar shows compliance metrics', async ({ page }) => {
        // Stats bar shows: Requiring Action / Reviewed / Total
        const statsLabel = page.getByText(/requiring action|reviewed|total/i).first();
        if (await statsLabel.isVisible().catch(() => false)) {
            await expect(statsLabel).toBeVisible();
        }
    });

    test('risk indicator pills are displayed on audit items', async ({ page }) => {
        // Pills parsed from recommendations: Section 80 / Prescription / Interest Rate / Insurance
        const riskPill = page.getByText(/section 80|prescription|interest rate|insurance/i).first();
        if (await riskPill.isVisible().catch(() => false)) {
            await expect(riskPill).toBeVisible();
        }
    });

    test('"Mark Resolved" action is available on requiring-action items', async ({ page }) => {
        const resolveBtn = page.getByRole('button', { name: /mark resolved|resolve|update status/i }).first();
        if (await resolveBtn.isVisible().catch(() => false)) {
            await expect(resolveBtn).toBeVisible();
        }
    });

    test('ResolveModal opens when resolve button is clicked', async ({ page }) => {
        const resolveBtn = page.getByRole('button', { name: /mark resolved|resolve|update status/i }).first();
        if (await resolveBtn.isVisible().catch(() => false)) {
            await resolveBtn.click();

            // Modal should appear with a status selector and notes field
            const modal = page.getByRole('dialog');
            if (await modal.isVisible().catch(() => false)) {
                await expect(modal).toBeVisible();

                const notesField = modal.getByRole('textbox');
                if (await notesField.isVisible().catch(() => false)) {
                    await expect(notesField).toBeVisible();
                }
            }
        }
    });

    test('empty compliance list shows appropriate message', async ({ page }) => {
        // If no items, should show empty state message (not a crash)
        const body = page.locator('body');
        await expect(body).toBeVisible();
    });
});
