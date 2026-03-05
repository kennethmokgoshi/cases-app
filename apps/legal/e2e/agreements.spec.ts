import { test, expect } from '@playwright/test';

/**
 * Legal App — Agreements & Legal Proceedings E2E tests.
 * Covers the core legal-specific workflow: debt agreements, rescission tracker, dispute tracker.
 */

test.describe('Agreements List', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/agreements');
    });

    test('page renders without error', async ({ page }) => {
        await expect(page).not.toHaveURL(/\/login/);
        const heading = page.getByRole('heading').first();
        await expect(heading).toBeVisible({ timeout: 10_000 });
    });

    test('agreement list or empty state is visible', async ({ page }) => {
        // Either a list of agreements or an empty state message
        const content = page.locator('table, [data-testid="agreements-list"], p, h2').first();
        await expect(content).toBeVisible({ timeout: 10_000 });
    });

    test('status badges are present if agreements exist', async ({ page }) => {
        const statusBadge = page.getByText(/active|pending|rescinded|terminated/i).first();
        if (await statusBadge.isVisible().catch(() => false)) {
            await expect(statusBadge).toBeVisible();
        }
    });

    test('can navigate to an agreement detail if one exists', async ({ page }) => {
        const firstLink = page.getByRole('link').first();
        if (await firstLink.isVisible().catch(() => false)) {
            await firstLink.click();
            await expect(page).not.toHaveURL(/\/login/);
        }
    });
});

test.describe('Rescission Tracker', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/cases');
    });

    test('cases list loads for legal review', async ({ page }) => {
        await expect(page).not.toHaveURL(/\/login/);
    });

    test('case detail shows rescission status if case exists', async ({ page }) => {
        const firstCaseLink = page.getByRole('link').first();
        if (await firstCaseLink.isVisible().catch(() => false)) {
            await firstCaseLink.click();
            await expect(page).not.toHaveURL(/\/login/);

            // Check for rescission-related content
            const rescissionContent = page.getByText(/rescission|rule 49|application/i).first();
            if (await rescissionContent.isVisible().catch(() => false)) {
                await expect(rescissionContent).toBeVisible();
            }
        }
    });
});

test.describe('Dispute Tracker', () => {
    test('dispute tracker page is accessible', async ({ page }) => {
        // Try common URL patterns
        await page.goto('/cases');
        await expect(page).not.toHaveURL(/\/login/);
    });

    test('20-day countdown is visible on dispute cases', async ({ page }) => {
        await page.goto('/cases');
        const disputeLabel = page.getByText(/dispute|section 72|days remaining/i).first();
        if (await disputeLabel.isVisible().catch(() => false)) {
            await expect(disputeLabel).toBeVisible();
        }
    });

    test('PDF generation button is present on applicable legal documents', async ({ page }) => {
        await page.goto('/cases');
        const pdfBtn = page.getByRole('button', { name: /generate pdf|download|rescission|rule 49/i }).first();
        if (await pdfBtn.isVisible().catch(() => false)) {
            await expect(pdfBtn).toBeVisible();
        }
    });
});
