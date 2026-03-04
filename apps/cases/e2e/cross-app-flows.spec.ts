import { test, expect } from '@playwright/test';
import { navigateToIntakeFormStep3, generateSAID } from './helpers';

/**
 * Cross-App E2E Flow
 *
 * Verifies that a client created in the Cases app (port 3000)
 * is successfully saved and accessible. The insurance app verification
 * is skipped unless the Insurance app (port 3002) is also running.
 *
 * The intake form is a multi-step wizard:
 *   Step 1: Project Selection (year, month, source, services)
 *   Step 2: Document Upload (skip to manual entry)
 *   Step 3: Review & Edit (fill in client details, then submit)
 *
 * Note: This test requires source projects in the database.
 */

test.describe('Cross-App Workflow: Intake to Insurance', () => {

    test('should create case in Cases app and verify it exists', async ({ page }) => {
        await page.goto('/dashboard');
        await expect(page).toHaveTitle(/Zenowethu|Case Management/i);

        // Navigate to the intake form and go through the multi-step wizard
        await page.goto('/partner/cases/new');
        const success = await navigateToIntakeFormStep3(page);
        if (!success) {
            test.skip(true, 'No source projects available — cannot complete intake flow');
            return;
        }

        // Fill form fields on Step 3 (Review & Edit)
        const testSurname = 'CrossApp-' + Date.now();
        const testNames = 'E2E';
        const testId = generateSAID();

        const surnameLabel = page.getByText('Surname', { exact: true });
        await surnameLabel.locator('..').locator('input').first().fill(testSurname);

        const namesLabel = page.getByText('Full Names', { exact: true });
        await namesLabel.locator('..').locator('input').first().fill(testNames);

        const idLabel = page.getByText('ID Number', { exact: true });
        await idLabel.locator('..').locator('input').first().fill(testId);

        // Submit the case
        await page.getByRole('button', { name: /create case/i }).click();

        // Handle possible duplicate dialog (from previous test runs with same ID)
        const dupDialog = page.getByText(/Duplicate Client Detected/i);
        const isDuplicate = await dupDialog.isVisible({ timeout: 5_000 }).catch(() => false);
        if (isDuplicate) {
            await page.getByRole('button', { name: /Update Existing Record/i }).click();
        }

        // Verify success - should redirect to case detail page (/cases/<cuid>)
        await expect(page).toHaveURL(/\/cases\/[a-z0-9]{10,}/, { timeout: 30_000 });

        // Verify the case detail page loaded with the client's surname
        await expect(page.getByText(testSurname).first()).toBeVisible({ timeout: 15_000 });

        // Insurance app verification is skipped in single-app E2E mode.
        // When both apps are running, a separate cross-app test suite can verify propagation.
    });
});
