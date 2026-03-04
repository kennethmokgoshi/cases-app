import { Page, expect } from '@playwright/test';

/**
 * Shared helpers for Zenowethu E2E tests.
 */

/** Wait for the dashboard/home to be fully loaded after login. */
export async function waitForDashboard(page: Page) {
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });
}

/** Navigate to the cases list and wait for it to load. */
export async function gotoCasesList(page: Page) {
    await page.goto('/');
    await waitForDashboard(page);
}

/**
 * Open a case by its file number displayed in the cases list.
 * Assumes the authenticated user is already on a page showing the case list.
 */
export async function openCaseByFileNumber(page: Page, fileNumber: string) {
    const row = page.getByText(fileNumber);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();
    await expect(page).toHaveURL(/\/cases\//);
}

/**
 * Generates a valid-looking 13-digit South African ID number for testing.
 * Uses randomized date-of-birth and sequence to avoid collisions across test runs.
 * Format: YYMMDD SSSS C R Z (6 DOB + 4 sequence + 1 citizen + 1 race + 1 check)
 */
export function generateSAID(): string {
    // Random DOB: year 80-99, month 01-12, day 01-28
    const yy = String(80 + Math.floor(Math.random() * 20)).padStart(2, '0');
    const mm = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
    const dd = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
    const dob = `${yy}${mm}${dd}`;
    // Random 4-digit gender/sequence
    const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const citizen = '0'; // SA citizen
    const race = '8';
    const check = String(Math.floor(Math.random() * 10));
    return `${dob}${seq}${citizen}${race}${check}`;
}

/**
 * Navigate through the multi-step intake wizard to reach the form fields (Step 3).
 *
 * The intake form at /partner/cases/new (and /cases/new) has 3 steps:
 *   Step 1: Project Selection (year, month, source project, services)
 *   Step 2: Document Upload (with option to skip)
 *   Step 3: Review & Edit (form fields: Surname, Full Names, ID Number, etc.)
 *
 * This helper navigates from Step 1 through to Step 3 using "Skip & Enter Manually"
 * so no actual document uploads are needed.
 *
 * @returns true if navigation succeeded, false if blocked (e.g. no projects available)
 */
export async function navigateToIntakeFormStep3(page: Page): Promise<boolean> {
    // Wait for the page to finish loading projects from the API
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // Check if the page is showing "Something went wrong" (component crash)
    const hasError = await page.getByText('Something went wrong').isVisible({ timeout: 1000 }).catch(() => false);
    if (hasError) {
        return false;
    }

    // Wait for Step 1 form to render
    await page.waitForTimeout(2000);

    // Step 1: Select project and services
    // Year and Month should be pre-filled with current values.

    // Find the Main Source dropdown. It's the select after Year and Month.
    // Try to locate it via the "Choose partner source..." or "Choose source..." placeholder.
    const allSelects = page.locator('select');
    const selectCount = await allSelects.count();

    // The source dropdown is typically the 3rd select (after Year=0, Month=1)
    // But on /cases/new there might be an additional B2B/B2C radio first
    let sourceSelectEl = selectCount >= 3 ? allSelects.nth(2) : allSelects.last();

    // Check if this select has real options (beyond the placeholder)
    const options = sourceSelectEl.locator('option');
    const optionCount = await options.count();

    if (optionCount <= 1) {
        // No projects available -- cannot proceed through the wizard
        return false;
    }

    // Select the first real option (index 1, after the placeholder at index 0)
    const value = await options.nth(1).getAttribute('value');
    if (value) {
        await sourceSelectEl.selectOption(value);
    }

    // Wait for any conditional UI to update after project selection
    await page.waitForTimeout(500);

    // Click "Select All" to select all services (required before continuing)
    const selectAllBtn = page.getByText('Select All', { exact: true });
    if (await selectAllBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await selectAllBtn.click();
    } else {
        // Fallback: click the first service checkbox
        const firstCheckbox = page.locator('input[type="checkbox"]').first();
        if (await firstCheckbox.isVisible().catch(() => false)) {
            await firstCheckbox.check();
        }
    }

    await page.waitForTimeout(500);

    // Click "Continue to Upload Documents" button
    const continueBtn = page.getByRole('button', { name: /continue to upload/i });
    const isContinueEnabled = await continueBtn.isEnabled({ timeout: 5000 }).catch(() => false);
    if (!isContinueEnabled) {
        // Button is disabled, likely missing required selections
        return false;
    }
    await continueBtn.click();

    // Step 2: Skip document upload and go directly to manual entry
    const skipBtn = page.getByRole('button', { name: /skip.*manual/i });
    await expect(skipBtn).toBeVisible({ timeout: 10_000 });
    await skipBtn.click();

    // Step 3: Wait for the review/edit form to appear
    await expect(
        page.getByText(/review extracted data|personal information/i).first()
    ).toBeVisible({ timeout: 15_000 });

    return true;
}
