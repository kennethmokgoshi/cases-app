import { test, expect } from '@playwright/test';

test.describe('Cases Service Request Conversion Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Perform authentication/session seeding mock
    // In our system, we bypass login using cookies or a custom mock auth header in dev/test,
    // or by filling in the login form. Here we'll simulate a standard session check.
    await page.goto('/login');
    await page.fill('input[name="email"]', 'staff@zenowethu.co.za');
    await page.fill('input[name="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    
    // Ensure we are redirected to dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);
  });

  test('successfully converts a pending crediva request to a case', async ({ page }) => {
    await page.goto('/crediva-requests');

    // Verify page header
    await expect(page.locator('h1')).toContainText('Crediva Portal Requests');

    // Find first convert button that is not disabled (meaning not yet converted)
    const convertBtn = page.locator('button:has-text("Convert to Case")').first();
    await expect(convertBtn).toBeVisible();

    // Click convert and accept confirmation dialog
    page.once('dialog', async dialog => {
      expect(dialog.message()).toContain('Are you sure you want to convert this request');
      await dialog.accept();
    });
    
    await convertBtn.click();

    // Verify button text changes to Converted or successfully completes
    await expect(page.locator('text=Successfully converted')).toBeVisible();
    await expect(convertBtn).toHaveText(/Converted/i);
  });
});
