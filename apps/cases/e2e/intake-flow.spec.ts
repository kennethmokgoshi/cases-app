import { test, expect } from '@playwright/test';
import { generateSAID, navigateToIntakeFormStep3 } from './helpers';

/**
 * Intake Flow E2E Test
 *
 * Verifies the successful creation of a new case via the multi-step wizard:
 * 1. Navigate to the new case intake form
 * 2. Complete Step 1 (project selection) and Step 2 (skip to manual entry)
 * 3. Fill in valid consumer data on Step 3 (Review & Edit)
 * 4. Submit and verify redirection to case detail
 * 5. Verify case appears on dashboard
 *
 * Note: These tests require source projects to exist in the database.
 * If no projects are configured for the test user, tests will be skipped.
 */

test.describe('Core Intake Flow', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('successfully creates a new case', async ({ page }) => {
        // 1. Navigate to New Case form
        await page.goto('/partner/cases/new');

        // 2. Navigate through the multi-step wizard to Step 3 (Review & Edit)
        const success = await navigateToIntakeFormStep3(page);
        if (!success) {
            test.skip(true, 'No source projects available — cannot complete intake flow');
            return;
        }

        // 3. Fill the form fields on Step 3
        // Step 3 uses labels: "Surname", "Full Names", "ID Number", "Cell Number", "Email"
        const testId = generateSAID();
        const testSurname = 'User-' + Date.now();
        const testNames = 'Test E2E';
        const testEmail = `test-${Date.now()}@example.com`;
        const testPhone = '071' + Math.floor(1000000 + Math.random() * 9000000);

        // Find and fill fields by their label text
        const surnameLabel = page.getByText('Surname', { exact: true });
        await surnameLabel.locator('..').locator('input').first().fill(testSurname);

        const namesLabel = page.getByText('Full Names', { exact: true });
        await namesLabel.locator('..').locator('input').first().fill(testNames);

        const idLabel = page.getByText('ID Number', { exact: true });
        await idLabel.locator('..').locator('input').first().fill(testId);

        const emailLabel = page.getByText('Email', { exact: true });
        await emailLabel.locator('..').locator('input').first().fill(testEmail);

        const cellLabel = page.getByText('Cell Number', { exact: true });
        await cellLabel.locator('..').locator('input').first().fill(testPhone);

        // 4. Submit Form - Click "Create Case" button
        await page.getByRole('button', { name: /create case/i }).click();

        // Handle possible duplicate dialog (from previous test runs with same ID)
        const dupDialog = page.getByText(/Duplicate Client Detected/i);
        const isDuplicate = await dupDialog.isVisible({ timeout: 5_000 }).catch(() => false);
        if (isDuplicate) {
            await page.getByRole('button', { name: /Update Existing Record/i }).click();
        }

        // 5. Verify Success - should redirect to case detail page
        // The redirect goes to /cases/<caseId> where caseId is a CUID (not ZEN- prefixed)
        // Allow extra time for case creation API call
        await expect(page).toHaveURL(/\/cases\/[a-z0-9]{10,}/, { timeout: 30_000 });

        // 6. Check Dashboard for the created case
        await page.goto('/');
        await expect(page.getByText(testSurname).first()).toBeVisible({ timeout: 15_000 });
    });

    test('prevents duplicate case creation for same ID', async ({ page }) => {
        const duplicateId = '9001015000081'; // Fixed ID for test

        // First attempt: create a case with this ID
        await page.goto('/partner/cases/new');
        const success1 = await navigateToIntakeFormStep3(page);
        if (!success1) {
            test.skip(true, 'No source projects available — cannot complete intake flow');
            return;
        }

        // Fill Step 3 fields
        const surnameLabel1 = page.getByText('Surname', { exact: true });
        await surnameLabel1.locator('..').locator('input').first().fill('Last');

        const namesLabel1 = page.getByText('Full Names', { exact: true });
        await namesLabel1.locator('..').locator('input').first().fill('First');

        const idLabel1 = page.getByText('ID Number', { exact: true });
        await idLabel1.locator('..').locator('input').first().fill(duplicateId);

        await page.getByRole('button', { name: /create case/i }).click();

        // Wait for first submission to complete (success or duplicate error from prior run)
        await page.waitForTimeout(5000);

        // Second attempt with same ID
        await page.goto('/partner/cases/new');
        const success2 = await navigateToIntakeFormStep3(page);
        if (!success2) {
            test.skip(true, 'No source projects available — cannot complete second intake');
            return;
        }

        const surnameLabel2 = page.getByText('Surname', { exact: true });
        await surnameLabel2.locator('..').locator('input').first().fill('Attempt');

        const namesLabel2 = page.getByText('Full Names', { exact: true });
        await namesLabel2.locator('..').locator('input').first().fill('Second');

        const idLabel2 = page.getByText('ID Number', { exact: true });
        await idLabel2.locator('..').locator('input').first().fill(duplicateId);

        await page.getByRole('button', { name: /create case/i }).click();

        // Should show duplicate/already exists error
        await expect(page.getByText(/already exists|duplicate|existing case/i).first()).toBeVisible({ timeout: 15_000 });
    });
});
