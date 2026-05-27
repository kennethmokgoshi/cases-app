import { test, expect } from '@playwright/test';

test.describe('Credo Premium & Disputes Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate as a consumer in the Credo app (listening on port 3005)
    await page.goto('/login');
    await page.fill('input[name="email"]', 'consumer@example.com');
    await page.fill('input[name="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    
    await expect(page).toHaveURL(/.*\/dashboard/);
  });

  test('navigates to billing and completes mock subscription payment', async ({ page }) => {
    await page.goto('/billing');

    // Click premium subscription checkout button
    const payBtn = page.locator('button:has-text("Subscribe to Premium")');
    await expect(payBtn).toBeVisible();
    await payBtn.click();

    // Verify payment screen or successful subscription state
    await expect(page).toHaveURL(/.*\/billing\/success/);
    await expect(page.locator('h2')).toContainText('Thank you for subscribing!');
  });

  test('generates an AI dispute letter for credit provider', async ({ page }) => {
    await page.goto('/credit-report/disputes/new');

    // Select type of dispute (e.g. Prescribed Debt)
    await page.selectOption('select[name="type"]', 'PRESCRIBED_DEBT_NOTICE');
    await page.fill('input[name="creditorName"]', 'Standard Bank');
    await page.fill('input[name="accountNumber"]', 'STD-99887766');
    await page.fill('textarea[name="comments"]', 'No payment or acknowledgement made for over 3 years.');

    // Submit dispute form to trigger PDF generation
    await page.click('button[type="submit"]');

    // Verify success banner and document entry in vault
    await expect(page).toHaveURL(/.*\/documents/);
    await expect(page.locator('text=Prescribed Debt Notice generated successfully')).toBeVisible();
  });
});
