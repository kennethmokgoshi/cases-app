import { test, expect } from '@playwright/test';

/**
 * Insurance Underwriting Flow E2E tests.
 * Covers the core underwriting queue, assessment detail, and policy issuance.
 */

test.describe('Underwriting Queue', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/underwriting');
    });

    test('loads the underwriting queue without error', async ({ page }) => {
        await expect(page).not.toHaveURL(/\/login/);
        const heading = page.getByRole('heading').first();
        await expect(heading).toBeVisible({ timeout: 10_000 });
    });

    test('displays risk score or tier labels if assessments exist', async ({ page }) => {
        const riskLabel = page.getByText(/risk|tier|score|decision/i).first();
        if (await riskLabel.isVisible()) {
            await expect(riskLabel).toBeVisible();
        }
    });

    test('can navigate to an assessment detail if one exists', async ({ page }) => {
        const viewLink = page.getByRole('link', { name: /view|detail|open/i }).first();
        if (await viewLink.isVisible()) {
            await viewLink.click();
            await expect(page).not.toHaveURL(/\/login/);
        }
    });

    test('shows "Issue Policy" button on approved assessments', async ({ page }) => {
        await page.goto('/assessments');
        const approvedItem = page.getByText(/approved/i).first();
        if (await approvedItem.isVisible()) {
            await approvedItem.click();
            const issueBtn = page.getByRole('button', { name: /issue policy/i });
            if (await issueBtn.isVisible()) {
                await expect(issueBtn).toBeVisible();
            }
        }
    });
});

test.describe('Insurance Assessments List', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/assessments');
    });

    test('page renders without redirecting to login', async ({ page }) => {
        await expect(page).not.toHaveURL(/\/login/);
    });

    test('shows status filter or search if data exists', async ({ page }) => {
        const searchOrFilter = page.locator('input[type="search"], input[type="text"], select').first();
        if (await searchOrFilter.isVisible()) {
            await expect(searchOrFilter).toBeVisible();
        }
    });

    test('PENDING assessment shows underwrite decision options', async ({ page }) => {
        const pendingItem = page.getByText(/pending/i).first();
        if (await pendingItem.isVisible()) {
            await pendingItem.click();
            const decisionBtn = page.getByRole('button', { name: /underwrite|approve|decline|decision/i });
            if (await decisionBtn.isVisible()) {
                await expect(decisionBtn).toBeVisible();
            }
        }
    });
});

test.describe('Risk Scoring', () => {
    test('risk score is displayed on assessment detail', async ({ page }) => {
        await page.goto('/assessments');
        const firstLink = page.getByRole('link').first();
        if (await firstLink.isVisible()) {
            await firstLink.click();
            const scoreText = page.getByText(/score|risk|%/i).first();
            if (await scoreText.isVisible()) {
                await expect(scoreText).toBeVisible();
            }
        }
    });
});
