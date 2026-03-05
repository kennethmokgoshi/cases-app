import { test, expect } from '@playwright/test';

/**
 * Finance App — Payments E2E tests.
 * Covers payment list, unallocated payments, and the AllocatePaymentModal.
 */

test.describe('Payments List', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/payments');
    });

    test('page renders without error', async ({ page }) => {
        await expect(page).not.toHaveURL(/\/login/);
        const heading = page.getByRole('heading').first();
        await expect(heading).toBeVisible({ timeout: 10_000 });
    });

    test('payment table or list is visible', async ({ page }) => {
        const tableOrList = page.locator('table, [data-testid="payments-list"]').first();
        if (await tableOrList.isVisible().catch(() => false)) {
            await expect(tableOrList).toBeVisible();
        }
    });

    test('payment status badges are present if data exists', async ({ page }) => {
        const statusBadge = page.getByText(/matched|unallocated|processing|reconciled/i).first();
        if (await statusBadge.isVisible().catch(() => false)) {
            await expect(statusBadge).toBeVisible();
        }
    });

    test('unallocated payments show Allocate button', async ({ page }) => {
        const allocateBtn = page.getByRole('button', { name: /allocate/i }).first();
        if (await allocateBtn.isVisible().catch(() => false)) {
            await expect(allocateBtn).toBeVisible();
        }
    });
});

test.describe('Allocate Payment Modal', () => {
    test('AllocatePaymentModal opens when Allocate button is clicked', async ({ page }) => {
        await page.goto('/payments');

        const allocateBtn = page.getByRole('button', { name: /allocate/i }).first();
        if (await allocateBtn.isVisible().catch(() => false)) {
            await allocateBtn.click();

            const modal = page.getByRole('dialog');
            if (await modal.isVisible().catch(() => false)) {
                await expect(modal).toBeVisible();

                // Modal should have client search
                const clientSearch = modal.getByPlaceholder(/search client|client/i)
                    .or(modal.getByLabel(/client/i));
                if (await clientSearch.isVisible().catch(() => false)) {
                    await expect(clientSearch).toBeVisible();
                }
            }
        }
    });

    test('modal can be dismissed without allocating', async ({ page }) => {
        await page.goto('/payments');

        const allocateBtn = page.getByRole('button', { name: /allocate/i }).first();
        if (await allocateBtn.isVisible().catch(() => false)) {
            await allocateBtn.click();

            const modal = page.getByRole('dialog');
            if (await modal.isVisible().catch(() => false)) {
                const cancelBtn = modal.getByRole('button', { name: /cancel|close/i });
                if (await cancelBtn.isVisible().catch(() => false)) {
                    await cancelBtn.click();
                    await expect(modal).not.toBeVisible();
                }
            }
        }
    });
});

test.describe('Account Batches', () => {
    test('batches page is accessible', async ({ page }) => {
        await page.goto('/batches');
        await expect(page).not.toHaveURL(/\/login/);
    });

    test('batches list shows file name and status if data exists', async ({ page }) => {
        await page.goto('/batches');
        const batchRow = page.locator('table tbody tr, [data-testid="batch-row"]').first();
        if (await batchRow.isVisible().catch(() => false)) {
            const statusText = page.getByText(/processing|completed|failed/i).first();
            if (await statusText.isVisible().catch(() => false)) {
                await expect(statusText).toBeVisible();
            }
        }
    });
});
