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
 * (This is a simplified version; in production use a real Luhn generator if needed).
 */
export function generateSAID(): string {
    const dob = '900101'; // 1990-01-01
    const gender = '5000'; // Male
    const citizen = '0'; // Citizen
    const race = '8'; // Default
    const random = Math.floor(Math.random() * 9).toString();
    return `${dob}${gender}${citizen}${race}${random}`;
}
