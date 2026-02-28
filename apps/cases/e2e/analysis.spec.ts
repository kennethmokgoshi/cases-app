import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * Analysis Flow E2E Test
 * 
 * Verifies the document upload and AI extraction process:
 * 1. Upload a sample PDF
 * 2. Verify progress indicator
 * 3. Wait for extraction completion
 * 4. Verify status badge updates
 */

test.describe('Document Analysis Flow', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to a known test case or create one
        await page.goto('/');
        const caseLink = page.locator('tbody tr').first();
        await caseLink.click();
    });

    test('successfully uploads and triggers analysis', async ({ page }) => {
        // 1. Trigger Upload
        // Look for the upload input (hidden or visible)
        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.getByText(/upload|drop files/i).first().click();
        const fileChooser = await fileChooserPromise;

        // Use a small dummy PDF or real sample if available in repo
        await fileChooser.setFiles(path.join(__dirname, 'sample-docs/test.pdf'));

        // 2. Verify Uploading Status
        await expect(page.getByText(/uploading|processing/i)).toBeVisible();

        // 3. Verify Analysis Progress
        // The UI should show "Analyzing" or a progress bar
        await expect(page.getByText(/analyzing|extraction/i)).toBeVisible({ timeout: 15000 });

        // 4. Success State
        // Wait for status to change to COMPLETED or extracted fields to appear
        await expect(page.getByText(/analysis complete|extracted/i)).toBeVisible({ timeout: 60000 });
    });

    test('can trigger manual re-analysis', async ({ page }) => {
        // 1. Find Re-analyze button
        const reanalyzeBtn = page.getByRole('button', { name: /re-analyze|re-run/i });
        await expect(reanalyzeBtn).toBeVisible();

        // 2. Trigger and Confirm
        await reanalyzeBtn.click();

        // If there's a confirmation modal
        const confirmBtn = page.getByRole('button', { name: /confirm|ok/i });
        if (await confirmBtn.isVisible()) {
            await confirmBtn.click();
        }

        // 3. Verify it's running again
        await expect(page.getByText(/analyzing/i)).toBeVisible();
    });
});
