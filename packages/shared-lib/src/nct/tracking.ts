/**
 * NCT (National Consumer Tribunal) — Tracking & Monitoring
 * Methods to check case status and list submitted applications.
 */

import { Page } from 'puppeteer';
import { NCT_CONFIG, delay } from './browser';
import type { NCTCaseInfo, NCTCaseStatus } from './types';
import { logger } from '../logger';

/**
 * Retrieve all debt rearrangement cases from the NCT CMS
 */
export async function viewAllNCTCases(page: Page): Promise<NCTCaseInfo[]> {
    try {
        const viewAllUrl = `${NCT_CONFIG.baseUrl}/cms/view-all-debt-rearrangement-cases`;
        logger.info(`Navigating to NCT View All Cases: ${viewAllUrl}`);
        await page.goto(viewAllUrl, { waitUntil: 'networkidle2', timeout: NCT_CONFIG.timeout });

        // Wait for table to load
        await delay(2000);

        // Extract cases from the table
        const cases = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table tr')).slice(1); // Skip header
            return rows.map(row => {
                const cells = Array.from(row.querySelectorAll('td'));
                if (cells.length < 5) return null;

                return {
                    caseNumber: cells[0]?.innerText.trim(),
                    identityNo: cells[1]?.innerText.trim(),
                    consumerName: cells[2]?.innerText.trim(),
                    filingDate: cells[3]?.innerText.trim(),
                    status: cells[4]?.innerText.trim().toUpperCase() as NCTCaseStatus
                };
            }).filter(Boolean) as NCTCaseInfo[];
        });

        logger.info(`Extracted ${cases.length} cases from NCT`);
        return cases;
    } catch (error: any) {
        logger.error({ err: error }, 'Failed to view NCT cases');
        return [];
    }
}

/**
 * Check the status of a specific case by ID number or Case Number
 */
export async function getNCTCaseStatus(page: Page, identifier: string): Promise<NCTCaseStatus | 'NOT_FOUND'> {
    try {
        const cases = await viewAllNCTCases(page);
        const targetCase = cases.find(c =>
            c.identityNo === identifier ||
            c.caseNumber === identifier
        );

        if (targetCase) {
            logger.info(`Found case status for ${identifier}: ${targetCase.status}`);
            return targetCase.status;
        }

        logger.info(`No case found for identifier: ${identifier}`);
        return 'NOT_FOUND';
    } catch (error: any) {
        logger.error({ err: error }, `Error checking NCT status for ${identifier}`);
        return 'NOT_FOUND';
    }
}
