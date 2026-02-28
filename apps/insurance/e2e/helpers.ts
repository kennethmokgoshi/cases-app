import { Page, expect } from '@playwright/test';

/** Wait for the dashboard/home to be fully loaded after login. */
export async function waitForDashboard(page: Page) {
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });
}

/** Navigate to the insurance dashboard root and wait for it to load. */
export async function gotoDashboard(page: Page) {
    await page.goto('/');
    await waitForDashboard(page);
}

/**
 * Generates a valid-looking 13-digit South African ID number for testing.
 */
export function generateSAID(): string {
    const dob = '900101'; // 1990-01-01
    const gender = '5000'; // Male
    const citizen = '0'; // Citizen
    const race = '8'; // Default
    const random = Math.floor(Math.random() * 9).toString();
    return `${dob}${gender}${citizen}${race}${random}`;
}
