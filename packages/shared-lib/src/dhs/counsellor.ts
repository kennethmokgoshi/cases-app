/**
 * DHS (NCR Debt Help System) — Debt Counsellor Lookup
 * Extracts debt counsellor details from the DHS popup.
 */

import { Page } from 'puppeteer';
import { delay } from './browser';
import type { DHSDebtCounsellorInfo } from './types';

/**
 * Get debt counsellor details from the DHS popup
 */
export async function getDebtCounsellorInfo(page: Page): Promise<DHSDebtCounsellorInfo | undefined> {
    try {
        // Click on DEBT COUN. cell to open popup
        await page.click('a[class*="dcinfo"], td:nth-child(7) a');
        await delay(1000);

        // Extract DC info from popup
        const info = await page.evaluate(() => {
            const getValue = (label: string): string => {
                const row = Array.from(document.querySelectorAll('tr, .info-row'))
                    .find(r => r.textContent?.includes(label));
                return row?.querySelector('td:last-child, .value')?.textContent?.trim() || '';
            };

            return {
                ncrRegistrationNo: getValue('NCR Registration'),
                fullName: getValue('Full Name'),
                tradingName: getValue('Trading Name'),
                tel: getValue('Tel'),
                mobile: getValue('Mobile'),
                fax: getValue('Fax'),
                email: getValue('Email'),
                province: getValue('Province'),
                operatingStatus: getValue('Operating Status')
            };
        });

        // Close popup
        await page.click('.modal .close, .popup .close, button:has-text("Close")');

        return info;
    } catch {
        return undefined;
    }
}
