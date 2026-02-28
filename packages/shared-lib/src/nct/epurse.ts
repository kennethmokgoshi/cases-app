/**
 * NCT (National Consumer Tribunal) — ePurse & Financials
 * Methods to check balance and transactional history.
 */

import { Page } from 'puppeteer';
import { NCT_CONFIG, delay } from './browser';
import { logger } from '../logger';

/**
 * Retrieve current ePurse balance from NCT CMS
 */
export async function getEPurseBalance(page: Page): Promise<{ balance: number; lastChecked: string }> {
    try {
        const epurseUrl = `${NCT_CONFIG.baseUrl}/cms/epurse-balance`;
        logger.info(`Navigating to NCT ePurse: ${epurseUrl}`);
        await page.goto(epurseUrl, { waitUntil: 'networkidle2', timeout: NCT_CONFIG.timeout });

        // Wait for balance to appear
        await delay(2000);

        // Extract balance from the page
        const balanceData = await page.evaluate(() => {
            // Guessed selector based on typical CMS balance display
            const balanceElement = document.querySelector('.balance-amount, #lblBalance, .epurse-value');
            if (balanceElement) {
                const text = balanceElement.textContent || '0';
                const numeric = parseFloat(text.replace(/[^0-9.]/g, ''));
                return isNaN(numeric) ? 0 : numeric;
            }

            // Fallback: search for Currency symbols
            const bodyText = document.body.innerText;
            const match = bodyText.match(/Balance\s*:\s*R?\s*([0-9,.]+)/i);
            if (match) {
                return parseFloat(match[1].replace(/,/g, ''));
            }

            return 0;
        });

        logger.info(`Retrieved NCT ePurse Balance: R${balanceData}`);
        return {
            balance: balanceData,
            lastChecked: new Date().toISOString()
        };
    } catch (error) {
        logger.error({ err: error }, 'Failed to retrieve NCT ePurse balance');
        return {
            balance: 0,
            lastChecked: new Date().toISOString()
        };
    }
}
