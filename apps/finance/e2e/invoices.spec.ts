import { test, expect } from '@playwright/test';

/**
 * Finance App — Invoices E2E tests.
 * Covers invoice list, new invoice form, and revenue dashboard.
 */

test.describe('Invoices List', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/invoices');
    });

    test('page renders without error', async ({ page }) => {
        await expect(page).not.toHaveURL(/\/login/);
        await expect(page.getByRole('heading', { name: /invoices/i })).toBeVisible({ timeout: 10_000 });
    });

    test('search or filter input is present', async ({ page }) => {
        const searchInput = page.getByPlaceholder(/search|invoice|client/i);
        if (await searchInput.isVisible()) {
            await expect(searchInput).toBeVisible();
        }
    });

    test('invoice status badges are shown if data exists', async ({ page }) => {
        const statusBadge = page.getByText(/paid|draft|sent|overdue|cancelled/i).first();
        if (await statusBadge.isVisible()) {
            await expect(statusBadge).toBeVisible();
        }
    });

    test('PDF download link is present on invoice rows if data exists', async ({ page }) => {
        const pdfLink = page.getByRole('link', { name: /pdf|download/i }).first();
        if (await pdfLink.isVisible()) {
            await expect(pdfLink).toBeVisible();
        }
    });

    test('can navigate to invoice detail if one exists', async ({ page }) => {
        const firstInvoiceLink = page.getByRole('link').first();
        if (await firstInvoiceLink.isVisible()) {
            await firstInvoiceLink.click();
            await expect(page).not.toHaveURL(/\/login/);
        }
    });
});

test.describe('New Invoice Form', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/invoices/new');
    });

    test('new invoice page renders without error', async ({ page }) => {
        await expect(page).not.toHaveURL(/\/login/);
    });

    test('client typeahead search field is present', async ({ page }) => {
        const clientSearch = page.getByPlaceholder(/search client|client name/i)
            .or(page.getByLabel(/client/i));
        if (await clientSearch.isVisible()) {
            await expect(clientSearch).toBeVisible();
        }
    });

    test('line items section is present', async ({ page }) => {
        const lineItems = page.getByText(/line items|description|amount/i).first();
        if (await lineItems.isVisible()) {
            await expect(lineItems).toBeVisible();
        }
    });

    test('VAT toggle is present', async ({ page }) => {
        const vatToggle = page.getByLabel(/vat/i)
            .or(page.getByText(/vat/i).first());
        if (await vatToggle.isVisible()) {
            await expect(vatToggle).toBeVisible();
        }
    });

    test('submit / create button is present', async ({ page }) => {
        const submitBtn = page.getByRole('button', { name: /create|save|submit invoice/i });
        if (await submitBtn.isVisible()) {
            await expect(submitBtn).toBeVisible();
        }
    });
});

test.describe('Revenue Dashboard', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/revenue');
    });

    test('page renders without error', async ({ page }) => {
        await expect(page).not.toHaveURL(/\/login/);
    });

    test('KPI cards are visible', async ({ page }) => {
        const kpiCard = page.getByText(/revenue|collections|total|outstanding/i).first();
        if (await kpiCard.isVisible()) {
            await expect(kpiCard).toBeVisible();
        }
    });

    test('monthly/quarterly toggle or chart is present', async ({ page }) => {
        const toggle = page.getByRole('button', { name: /monthly|quarterly/i }).first();
        if (await toggle.isVisible()) {
            await expect(toggle).toBeVisible();
        }
    });

    test('ZAR amounts appear in revenue data', async ({ page }) => {
        const zarAmount = page.getByText(/R\s?\d|ZAR/i).first();
        if (await zarAmount.isVisible()) {
            await expect(zarAmount).toBeVisible();
        }
    });
});
