/**
 * DHS (NCR Debt Help System) — Consumer Search & Detailed Scraping
 * Lightweight consumer lookup and full table scrape for auto-fill.
 */

import fs from 'fs';
import path from 'path';
import { getDHSCredentials } from '../integrations';
import { getBrowser, loginToDHS, delay, DHS_CONFIG } from './browser';
import { extractConsumerInfo } from './extraction';
import { getDebtCounsellorInfo } from './counsellor';
import type { DHSConsumerInfo, DHSDebtCounsellorInfo, DHSDetailedInfo } from './types';
import { logger } from '../logger';

/**
 * Search for a consumer in DHS (for new transfer request)
 */
export async function searchConsumer(idNumber: string): Promise<{
    found: boolean;
    consumer?: DHSConsumerInfo;
    debtCounsellor?: DHSDebtCounsellorInfo;
    message?: string;
}> {
    const browserInstance = await getBrowser();
    const page = await browserInstance.newPage();

    try {
        // Get credentials from database/config
        const credentials = await getDHSCredentials();

        // Login first
        const loggedIn = await loginToDHS(page, credentials);
        if (!loggedIn) {
            return { found: false, message: 'Failed to login to DHS' };
        }

        // Navigate to Request New Transfer page
        await page.goto(DHS_CONFIG.requestTransferUrl, { waitUntil: 'networkidle2', timeout: DHS_CONFIG.timeout });

        // Enter ID number
        await page.waitForSelector('input[name*="txtIdNumber"], input[id*="txtIdNumber"]', { timeout: 10000 });
        await page.type('input[name*="txtIdNumber"], input[id*="txtIdNumber"]', idNumber);

        // Click Apply Filter
        await page.click('input[value="Apply Filter"], button:has-text("Apply Filter")');
        await delay(2000);

        // Check if consumer found
        const noRecordsFound = await page.$('text/No records found');
        if (noRecordsFound) {
            return { found: false, message: 'Consumer not found in DHS' };
        }

        // Extract consumer info
        const consumer = await extractConsumerInfo(page);

        // Get debt counsellor info
        const debtCounsellor = await getDebtCounsellorInfo(page);

        return { found: true, consumer, debtCounsellor };
    } catch (error) {
        logger.error('Error searching consumer:', error);
        return { found: false, message: `Error: ${error} ` };
    } finally {
        await page.close();
    }
}

/**
 * Scrape detailed consumer and debt counsellor info for Auto-fill
 * Targeted Page: dhs_RequestNewTransfer.aspx
 */
export async function scrapeDetailedConsumerInfo(idNumber: string): Promise<{ success: boolean; data?: DHSDetailedInfo; message?: string }> {
    const browserInstance = await getBrowser();
    const page = await browserInstance.newPage();

    // Debug Screenshot Helper
    const screenshotDir = 'C:/Users/user/.gemini/antigravity/brain/5010af79-02d1-4821-b2f1-67080174b2e7';
    // Run ID for data dump grouping
    const scanId = new Date().toLocaleString('sv').replace(/ /g, '_').replace(/:/g, '-');

    const takeDebugScreenshot = async (name: string) => {
        try {
            // Generate timestamp for THIS step
            const stepTime = new Date().toLocaleString('sv').replace(/ /g, '_').replace(/:/g, '-');
            await page.screenshot({ path: `${screenshotDir}/${name}_${stepTime}.png`, fullPage: true });
            logger.info(`Saved screenshot: ${name}_${stepTime}.png`);
        } catch (e) {
            logger.error('Screenshot failed:', e);
        }
    };

    try {
        const credentials = await getDHSCredentials();
        const loggedIn = await loginToDHS(page, credentials);
        await takeDebugScreenshot('1_after_login');
        if (!loggedIn) {
            await page.close();
            return { success: false, message: 'Login failed' };
        }

        // Navigate to Request New Transfer page (SPECIFIC USER REQUIREMENT)
        await page.goto(DHS_CONFIG.requestTransferUrl, { waitUntil: 'networkidle2', timeout: DHS_CONFIG.timeout });
        await delay(1000);
        await takeDebugScreenshot('2_request_page_loaded');

        // Enter ID
        const idInputSelectors = [
            '#ContentPlaceHolder1_txtIdNumber',
            '#ContentPlaceHolder1_txtRSAID',
            'input[id*="txtId"]',
            'input[type="text"]'
        ];

        let idSelector = null;
        for (const sel of idInputSelectors) {
            if (await page.$(sel)) {
                idSelector = sel;
                break;
            }
        }

        if (!idSelector) {
            await page.close();
            return { success: false, message: 'Could not find ID input field' };
        }

        await page.click(idSelector, { clickCount: 3 });
        await page.type(idSelector, idNumber);
        await takeDebugScreenshot('3_id_entered');

        // Click Apply Filter
        const filterSelectors = [
            '#cp_pagedata_lb_ApplyDataFilter',
            'a:has-text("Apply Filter")',
            'a[id*="ApplyDataFilter"]',
            '#ContentPlaceHolder1_btnFilter'
        ];

        let filterClicked = false;
        for (const sel of filterSelectors) {
            try {
                if (await page.$(sel)) {
                    await page.evaluate((s) => (document.querySelector(s) as HTMLElement).click(), sel);
                    filterClicked = true;
                    break;
                }
            } catch (e) { }
        }

        if (!filterClicked) {
            await page.keyboard.press('Enter');
        }

        // Wait for table
        await delay(3000);
        await takeDebugScreenshot('4_results_table');

        // Check if results exist
        const noResults = await page.evaluate(() => document.body.innerText.includes('No records found'));
        if (noResults) {
            await page.close();
            return { success: false, message: 'No DHS records found for this ID' };
        }

        // Extract Main Table Data (Row 1)
        const mainData = await page.evaluate((targetId) => {
            const tables = Array.from(document.querySelectorAll('table'));

            // 1. Find Data Row by ID (Most Valid Method)
            let dataRow = null;
            const cleanTargetId = targetId.replace(/\s/g, '');

            for (const table of tables) {
                const rows = Array.from(table.querySelectorAll('tr'));
                for (const r of rows) {
                    const txt = r.innerText.replace(/\s/g, '');
                    if (txt.includes(cleanTargetId)) {
                        dataRow = r;
                        break;
                    }
                }
                if (dataRow) break;
            }

            if (!dataRow) {
                const tableSummaries = tables.map(t => t.innerText.substring(0, 50).replace(/\n/g, ' '));
                return {
                    allCells: [`DEBUG: ID ${targetId} not found. Tables: ${JSON.stringify(tableSummaries)}`],
                    identityNo: '', surname: '', gender: '', status: '', debtCounsellorName: '', transferIndicator: '', province: ''
                };
            }

            const cells = Array.from(dataRow.querySelectorAll('td')).map(td => (td as HTMLElement).textContent?.trim() || '');

            const idIndex = cells.findIndex(c => c.replace(/\s/g, '') === cleanTargetId);

            if (idIndex === -1) {
                return {
                    allCells: cells,
                    identityNo: '', surname: '', gender: '', status: '', debtCounsellorName: '', transferIndicator: '', province: ''
                };
            }

            return {
                allCells: cells,
                identityNo: cells[idIndex] || '',
                surname: cells[idIndex + 1] || '',
                gender: cells[idIndex + 3] || '',
                status: cells[idIndex + 4] || '',
                transferIndicator: cells[idIndex + 5] || '',
                ncrdcNo: cells[idIndex + 6] || '',  // This is the NCRDC No, not the Name
                debtCounsellorName: '',             // Name is in popup
                province: cells[idIndex + 7] || ''
            };
        }, idNumber);

        if (!mainData) {
            await page.close();
            return { success: false, message: 'Could not extract data from results table' };
        }

        logger.info('DEBUG: DHS Table Cells:', JSON.stringify(mainData.allCells));

        // Write debug data to file for easier inspection
        try {
            const debugPath = `${screenshotDir}/dhs_table_dump_${scanId}.json`;
            fs.writeFileSync(debugPath, JSON.stringify(mainData, null, 2));
            logger.info(`Saved table data to: ${debugPath}`);
        } catch (err) {
            logger.error('Failed to write debug data file:', err);
        }

        let detailedInfo: DHSDetailedInfo = {
            identityNo: mainData.identityNo,
            surname: mainData.surname,
            firstNames: mainData.surname,
            gender: mainData.gender,
            status: mainData.status,
            transferIndicator: mainData.transferIndicator,
            debtCounsellorName: '', // Will be populated by popup if successful
            province: mainData.province,
            ncrdcNo: (mainData as any).ncrdcNo, // Type cast or update interface if needed, relying on 'any' for now or update below
            dcFullName: '',
            dcTradingName: '',
            dcOperatingStatus: '',
            dcMobile: '',
            dcEmail: ''
        };

        // Open Debt Counsellor Pop-up
        // [TURBO MODE] Skip popup extraction for speed.
        logger.info('Skipping popup logic. Returning table data immediately.');
        await page.close();
        return { success: true, data: detailedInfo };

    } catch (error) {
        await page.close();
        return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
}
