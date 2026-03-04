import { test, expect } from '@playwright/test';

/**
 * Cross-App E2E Flow
 * 
 * Verifies that a client created in the Cases app (port 3000)
 * correctly appears and flows into the Insurance app (port 3002).
 */

test.describe('Cross-App Workflow: Intake to Insurance', () => {

    test('should propagate new case to insurance underwriting', async ({ page, context }) => {
        // Step 1: Create a new client in the Cases app
        const casesUrl = 'http://localhost:3000';
        const insuranceUrl = 'http://localhost:3002';

        await page.goto(`${casesUrl}/dashboard`);
        await expect(page).toHaveTitle(/Zenowethu|Case Management/i);

        // Simulate clicking "New Case" and filling basic info
        await page.getByRole('link', { name: /new case|intake/i }).first().click();

        const fileNumber = `E2E-${Date.now()}`;
        await page.getByLabel(/file number/i).fill(fileNumber);
        await page.getByLabel(/first name/i).fill('E2E');
        await page.getByLabel(/last name/i).fill('Test-User');
        await page.getByRole('button', { name: /save|create/i }).click();

        // Wait for creation and verify success
        await expect(page.locator(`text=${fileNumber}`)).toBeVisible();

        // Step 2: Switch to Insurance App and verify the case appears in Assessments
        // We reuse the same page/context but navigate to the other app's URL
        await page.goto(`${insuranceUrl}/assessments`);
        await expect(page).toHaveTitle(/Insurance/i);

        // Search for the newly created file number
        const searchInput = page.getByPlaceholder(/search|file/i);
        if (await searchInput.isVisible()) {
            await searchInput.fill(fileNumber);
        }

        // Verify the case is present in the insurance assessment list
        // Note: There might be a slight delay in background processing if any
        await expect(page.locator(`text=${fileNumber}`)).toBeVisible({ timeout: 10_000 });

        // Final verification: Ensure the status is PENDING/NEW
        await expect(page.locator(`text=PENDING|NEW`).first()).toBeVisible();
    });
});
