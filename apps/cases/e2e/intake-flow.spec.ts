import { test, expect } from '@playwright/test';
import { generateSAID } from './helpers';

/**
 * Intake Flow E2E Test
 * 
 * Verifies the successful creation of a new case:
 * 1. Navigate to the new case intake form
 * 2. Fill in valid consumer data and SA ID
 * 3. Submit and verify redirection to case detail
 * 4. Verify case appears on dashboard
 */

test.describe('Core Intake Flow', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('successfully creates a new case', async ({ page }) => {
        // 1. Navigate to New Case form
        await page.goto('/partner/cases/new');

        // 2. Fill the form
        const testId = generateSAID();
        const testFirstName = 'Test';
        const testLastName = 'User-' + Date.now();
        const testEmail = `test-${Date.now()}@example.com`;
        const testPhone = '071' + Math.floor(1000000 + Math.random() * 9000000);

        await page.getByLabel(/id number|sa id/i).fill(testId);
        await page.getByLabel(/first name/i).fill(testFirstName);
        await page.getByLabel(/last name|surname/i).fill(testLastName);
        await page.getByLabel(/email/i).fill(testEmail);
        await page.getByLabel(/phone|cell/i).fill(testPhone);

        // 3. Submit Form
        await page.getByRole('button', { name: /create|submit|save/i }).click();

        // 4. Verify Success
        await expect(page).toHaveURL(/\/cases\/ZEN-|dashboard/);

        // Save case number for duplicate check
        const url = page.url();

        // 5. Check Dashboard
        await page.goto('/');
        await expect(page.getByText(testLastName)).toBeVisible();
    });

    test('prevents duplicate case creation for same ID', async ({ page }) => {
        const duplicateId = '9001015000081'; // Fixed ID for test

        // First attempt (cleanup first if needed, but here we just test prevention)
        await page.goto('/partner/cases/new');
        await page.getByLabel(/id number|sa id/i).fill(duplicateId);
        await page.getByLabel(/first name/i).fill('First');
        await page.getByLabel(/last name/i).fill('Last');
        await page.getByRole('button', { name: /create|submit/i }).click();

        // Second attempt with same ID
        await page.goto('/partner/cases/new');
        await page.getByLabel(/id number|sa id/i).fill(duplicateId);
        await page.getByLabel(/first name/i).fill('Second');
        await page.getByLabel(/last name/i).fill('Attempt');
        await page.getByRole('button', { name: /create|submit/i }).click();

        // Should show validation error
        await expect(page.getByText(/already exists|duplicate/i)).toBeVisible();
    });
});
