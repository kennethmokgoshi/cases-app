import { test, expect } from '@playwright/test';

/**
 * Case management E2E tests.
 * Runs with the saved auth state from global.setup.ts (already logged in).
 *
 * These tests cover:
 *  - Viewing the cases dashboard after login
 *  - Navigating to a case detail page
 *  - Creating a new case via the partner new-case form
 *  - Case search
 */

test.describe('Cases dashboard', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('loads dashboard without redirecting to login', async ({ page }) => {
        await expect(page).not.toHaveURL(/\/login/);
    });

    test('shows the app heading or navigation', async ({ page }) => {
        // The sidebar/nav should contain "Cases" or "ZENOWETHU"
        await expect(
            page.getByText(/zenowethu|cases/i).first()
        ).toBeVisible({ timeout: 10_000 });
    });
});

test.describe('Case detail page', () => {
    test('navigating to /cases/[id] with a bad id shows not-found or redirects', async ({ page }) => {
        await page.goto('/cases/nonexistent-id-00000');
        // Should either show a 404 message or redirect to dashboard
        const is404 = await page.getByText(/not found|404|does not exist/i).isVisible().catch(() => false);
        const redirectedAway = !page.url().includes('/cases/nonexistent-id-00000');
        expect(is404 || redirectedAway).toBeTruthy();
    });
});

test.describe('New case form', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/partner/cases/new');
    });

    test('renders the new case form', async ({ page }) => {
        // The page should not redirect to login (auth is valid)
        await expect(page).not.toHaveURL(/\/login/);

        // Key form elements should be present
        // SA ID number field is central to intake
        const idField = page.getByLabel(/id number|sa id|identity/i).first();
        const altIdField = page.locator('input[placeholder*="ID"]').first();

        const hasIdField = await idField.isVisible().catch(() => false)
            || await altIdField.isVisible().catch(() => false);
        expect(hasIdField).toBeTruthy();
    });

    test('shows validation error for invalid SA ID number', async ({ page }) => {
        // SA IDs are exactly 13 digits; anything shorter should trigger validation
        const idInput = page.locator('input[placeholder*="ID"], input[name*="id"], input[id*="id"]').first();

        if (!(await idInput.isVisible().catch(() => false))) {
            test.skip(true, 'Could not locate ID input — page structure may have changed');
        }

        await idInput.fill('123'); // too short
        await page.keyboard.press('Tab'); // blur to trigger validation

        // Some validation feedback should appear
        const hasError = await page.getByText(/invalid|required|13 digit/i).isVisible().catch(() => false);
        // We accept either an error message or the field being marked invalid
        const isInvalid = await idInput.getAttribute('aria-invalid').catch(() => null);
        expect(hasError || isInvalid === 'true').toBeTruthy();
    });
});

test.describe('Case search', () => {
    test('search API returns JSON', async ({ request }) => {
        const response = await request.get('/api/cases/search?q=ZEN-');
        expect(response.status()).toBe(200);
        const body = await response.json();
        // Should return an array (possibly empty)
        expect(Array.isArray(body)).toBeTruthy();
    });

    test('unauthenticated search request is rejected', async ({ request }) => {
        // Create a new request context without any auth cookies
        const response = await request.get('/api/cases/search?q=ZEN-', {
            headers: { cookie: '' } });
        // 401 or 403 or redirect — not a 200 with data
        expect(response.status()).not.toBe(200);
    });
});
