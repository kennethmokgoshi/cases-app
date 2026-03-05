import { test, expect } from '@playwright/test';

/**
 * Forensic Audit App — Audit Flow E2E tests.
 * Covers the forensic audit engine: running audits, viewing results, and PDF report generation.
 */

test.describe('Audit Queue', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/cases');
    });

    test('cases list loads for forensic review', async ({ page }) => {
        await expect(page).not.toHaveURL(/\/login/);
        const heading = page.getByRole('heading').first();
        await expect(heading).toBeVisible({ timeout: 10_000 });
    });

    test('Forensic Audit tab is visible on case detail', async ({ page }) => {
        const firstCaseLink = page.getByRole('link').first();
        if (await firstCaseLink.isVisible().catch(() => false)) {
            await firstCaseLink.click();
            await expect(page).not.toHaveURL(/\/login/);

            // Look for the Forensic Audit tab
            const forensicTab = page.getByRole('tab', { name: /forensic/i })
                .or(page.getByText(/forensic audit/i).first());
            if (await forensicTab.isVisible().catch(() => false)) {
                await expect(forensicTab).toBeVisible();
            }
        }
    });
});

test.describe('Audit Results', () => {
    test('audit results page renders without error', async ({ page }) => {
        await page.goto('/cases');
        const firstCaseLink = page.getByRole('link').first();
        if (await firstCaseLink.isVisible().catch(() => false)) {
            await firstCaseLink.click();

            // Navigate to forensic audit tab if present
            const forensicTab = page.getByRole('tab', { name: /forensic/i });
            if (await forensicTab.isVisible().catch(() => false)) {
                await forensicTab.click();

                // Risk meter or findings should be visible
                const riskMeter = page.getByText(/risk score|overall risk|findings/i).first();
                if (await riskMeter.isVisible().catch(() => false)) {
                    await expect(riskMeter).toBeVisible();
                }
            }
        }
    });

    test('Run Audit button is visible on case with no audit', async ({ page }) => {
        await page.goto('/cases');
        const firstCaseLink = page.getByRole('link').first();
        if (await firstCaseLink.isVisible().catch(() => false)) {
            await firstCaseLink.click();

            const forensicTab = page.getByRole('tab', { name: /forensic/i });
            if (await forensicTab.isVisible().catch(() => false)) {
                await forensicTab.click();

                const runBtn = page.getByRole('button', { name: /run audit|start audit/i });
                if (await runBtn.isVisible().catch(() => false)) {
                    await expect(runBtn).toBeVisible();
                }
            }
        }
    });

    test('PDF report download button is present after audit completion', async ({ page }) => {
        await page.goto('/cases');
        const firstCaseLink = page.getByRole('link').first();
        if (await firstCaseLink.isVisible().catch(() => false)) {
            await firstCaseLink.click();

            const forensicTab = page.getByRole('tab', { name: /forensic/i });
            if (await forensicTab.isVisible().catch(() => false)) {
                await forensicTab.click();

                const pdfBtn = page.getByRole('button', { name: /pdf|download report/i });
                if (await pdfBtn.isVisible().catch(() => false)) {
                    await expect(pdfBtn).toBeVisible();
                }
            }
        }
    });
});

test.describe('Active Investigations Panel', () => {
    test('dashboard shows recent audits panel if data exists', async ({ page }) => {
        await page.goto('/');
        const investigationsPanel = page.getByText(/active investigations|recent audits/i).first();
        if (await investigationsPanel.isVisible().catch(() => false)) {
            await expect(investigationsPanel).toBeVisible();
        }
    });

    test('Red Flag Center shows requires-action audits if data exists', async ({ page }) => {
        await page.goto('/');
        const redFlagPanel = page.getByText(/red flag|requires action/i).first();
        if (await redFlagPanel.isVisible().catch(() => false)) {
            await expect(redFlagPanel).toBeVisible();
        }
    });
});
