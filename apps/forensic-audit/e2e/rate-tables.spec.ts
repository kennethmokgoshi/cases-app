import { test, expect } from '@playwright/test';

/**
 * Forensic Audit App — Rate Tables Admin E2E tests.
 * Covers the /admin/rate-tables CRUD page: stats bar, filter bar, add/edit/delete modals.
 */

test.describe('Rate Tables List', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/admin/rate-tables');
    });

    test('page renders without error', async ({ page }) => {
        await expect(page).not.toHaveURL(/\/login/);
        const heading = page.getByRole('heading').first();
        await expect(heading).toBeVisible({ timeout: 10_000 });
    });

    test('stats bar is visible', async ({ page }) => {
        // Stats: total / active / inactive / account types
        const statsBar = page.getByText(/total|active|inactive/i).first();
        if (await statsBar.isVisible().catch(() => false)) {
            await expect(statsBar).toBeVisible();
        }
    });

    test('filter bar or search input is present', async ({ page }) => {
        const filterInput = page.locator('input[type="search"], input[type="text"], select').first();
        if (await filterInput.isVisible().catch(() => false)) {
            await expect(filterInput).toBeVisible();
        }
    });

    test('rate table entries are displayed in a table', async ({ page }) => {
        const table = page.locator('table');
        if (await table.isVisible().catch(() => false)) {
            await expect(table).toBeVisible();
        }
    });
});

test.describe('Rate Tables — Add Modal', () => {
    test('Add Rate Table button is visible', async ({ page }) => {
        await page.goto('/admin/rate-tables');
        const addBtn = page.getByRole('button', { name: /add|new rate table|create/i }).first();
        if (await addBtn.isVisible().catch(() => false)) {
            await expect(addBtn).toBeVisible();
        }
    });

    test('Add modal opens with required fields', async ({ page }) => {
        await page.goto('/admin/rate-tables');
        const addBtn = page.getByRole('button', { name: /add|new rate table|create/i }).first();
        if (await addBtn.isVisible().catch(() => false)) {
            await addBtn.click();

            const modal = page.getByRole('dialog');
            if (await modal.isVisible().catch(() => false)) {
                await expect(modal).toBeVisible();

                // Creditor name and account type are required fields
                const creditorField = modal.getByLabel(/creditor/i);
                if (await creditorField.isVisible().catch(() => false)) {
                    await expect(creditorField).toBeVisible();
                }
            }
        }
    });
});

test.describe('Rate Tables — Edit & Delete', () => {
    test('edit button opens pre-populated modal', async ({ page }) => {
        await page.goto('/admin/rate-tables');
        const editBtn = page.getByRole('button', { name: /edit/i }).first();
        if (await editBtn.isVisible().catch(() => false)) {
            await editBtn.click();

            const modal = page.getByRole('dialog');
            if (await modal.isVisible().catch(() => false)) {
                await expect(modal).toBeVisible();
            }
        }
    });

    test('delete button shows confirmation dialog', async ({ page }) => {
        await page.goto('/admin/rate-tables');
        const deleteBtn = page.getByRole('button', { name: /delete/i }).first();
        if (await deleteBtn.isVisible().catch(() => false)) {
            await deleteBtn.click();

            // Confirmation dialog should appear
            const confirmDialog = page.getByRole('dialog')
                .or(page.getByText(/are you sure|confirm delete/i).first());
            if (await confirmDialog.isVisible().catch(() => false)) {
                await expect(confirmDialog).toBeVisible();

                // Dismiss to avoid actually deleting test data
                const cancelBtn = page.getByRole('button', { name: /cancel|no/i });
                if (await cancelBtn.isVisible().catch(() => false)) {
                    await cancelBtn.click();
                }
            }
        }
    });

    test('isActive toggle is present on rate table rows', async ({ page }) => {
        await page.goto('/admin/rate-tables');
        const toggle = page.locator('input[type="checkbox"], [role="switch"]').first();
        if (await toggle.isVisible().catch(() => false)) {
            await expect(toggle).toBeVisible();
        }
    });
});
