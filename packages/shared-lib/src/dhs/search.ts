/**
 * DHS (NCR Debt Help System) — Consumer Search & Detailed Scraping
 * [Build fix: Corrected loop braces]
 */

import fs from 'fs';
import path from 'path';
import { getDHSCredentials } from '../integrations';
import { getBrowser, loginToDHS, delay, DHS_CONFIG } from './browser';
import { extractConsumerInfo, getDeclineReason } from './extraction';
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
    let target: any = page;

    try {
        // Get credentials from database/config
        const credentials = await getDHSCredentials();

        // Login first
        const loggedIn = await loginToDHS(page, credentials);
        if (!loggedIn) {
            return { found: false, message: 'Failed to login to DHS' };
        }

        // Navigate to Request New Transfer page
        logger.info(`[DHS search] Navigating to ${DHS_CONFIG.requestTransferUrl}`);
        await page.goto(DHS_CONFIG.requestTransferUrl, { waitUntil: 'load', timeout: DHS_CONFIG.timeout });
        
        // Debug Screenshot Helper
        const screenshotDir = path.join(process.cwd(), 'public', 'uploads', 'dhs_debug', idNumber);
        if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
        }

        let stepCounter = 1;
        const takeScreenshot = async (description?: string) => {
            const fileName = `DHSCHECKSTEP${stepCounter}.png`;
            const p = path.join(screenshotDir, fileName);
            await page.screenshot({ path: p, fullPage: true });
            logger.info(`[DHS debug] Screenshot saved: ${fileName} ${description ? '(' + description + ')' : ''}`);
            stepCounter++;
        };

        await delay(2000); // Give it a moment to settle
        await takeScreenshot('Page Loaded');
        logger.info(`[DHS search] Current URL after navigation: ${page.url()}`);

        const frames = page.frames();
        logger.info(`[DHS search] Detected ${frames.length} frames`);
        
        const contentFrame = frames.find(f => f.name() === 'framecontent' || f.url().includes('RequestNewTransfer'));
        if (contentFrame) {
            logger.info('[DHS search] Switching to content frame:', contentFrame.name() || contentFrame.url());
            target = contentFrame;
        } else {
            logger.info('[DHS search] No specific content frame found, staying on main page');
        }

        // Enter ID number - robust selectors
        const idInputSelectors = [
            '#cp_pagedata_f_RSAIDPass',
            '#ContentPlaceHolder1_txtIdNumber',
            '#ContentPlaceHolder1_txtRSAID',
            'input[id*="RSAID"]',
            'input[name*="RSAID"]',
            'input[id*="txtId"]',
            'input[name*="txtId"]'
        ];
        
        let idSelector = null;
        for (const sel of idInputSelectors) {
            if (await target.$(sel)) {
                idSelector = sel;
                break;
            }
        }
        
        if (!idSelector) {
            logger.error('[DHS search] Could not find ID input field in target');
            // Try one more time with a broader search in all frames
            for (const frame of frames) {
                for (const sel of idInputSelectors) {
                    if (await frame.$(sel)) {
                        logger.info(`[DHS search] Found ID input in frame: ${frame.name() || frame.url()}`);
                        target = frame;
                        idSelector = sel;
                        break;
                    }
                }
                if (idSelector) break;
            }
        }

        if (!idSelector) {
            logger.error('[DHS search] FINAL FAIL: Could not find ID input field');
            await takeScreenshot('Error - No ID Field');
            return { found: false, message: 'Could not find ID input field' };
        }

        logger.info(`[DHS search] Entering ID ${idNumber} into ${idSelector}`);
        await target.click(idSelector, { clickCount: 3 });
        await target.type(idSelector, idNumber);
        await takeScreenshot('ID Entered');

        // Click Apply Filter - robust selectors
        const filterSelectors = [
            '#cp_pagedata_lb_ApplyDataFilter',
            'a:has-text("Apply Filter")',
            'a[id*="ApplyDataFilter"]',
            '#ContentPlaceHolder1_btnFilter',
            'input[value="Apply Filter"]',
            '.btn-primary',
            'input[type="submit"]'
        ];

        let filterClicked = false;
        for (const sel of filterSelectors) {
            try {
                if (await target.$(sel)) {
                    logger.info(`[DHS search] Clicking filter button: ${sel}`);
                    await target.evaluate((s) => (document.querySelector(s) as HTMLElement).click(), sel);
                    filterClicked = true;
                    break;
                }
            } catch (e) { }
        }

        if (!filterClicked) {
            logger.info('[DHS search] Filter button not found in target, pressing Enter');
            await page.keyboard.press('Enter');
        }

        // Wait for results
        logger.info('[DHS search] Waiting 6s for results...');
        await delay(6000);
        await takeScreenshot('After Filter Clicked');

        // RE-CHECK: If we see "No records found", wait another 2s and check again
        // DHS AJAX can be extremely slow to clear the previous state
        const initialNoRecords = await target.evaluate(() => document.body.innerText.includes('No records found'));
        if (initialNoRecords) {
            logger.info('[DHS search] "No records found" detected, waiting 2s for potential AJAX update...');
            await delay(2000);
        }

        // Robust results check
        const resultsInfo = await target.evaluate((targetId) => {
            const bodyText = document.body.innerText;
            const noRecords = bodyText.includes('No records found');
            
            // Check for record indicator
            const displayingMatch = bodyText.match(/Displaying\s+(?:records?\s+)?(\d+)(?:\s*-\s*(\d+))?/i);
            const hasRecordInText = bodyText.includes(targetId);
            
            return {
                noRecords,
                hasDisplayingRecords: !!(displayingMatch && parseInt(displayingMatch[1]) > 0),
                hasIdInText: hasRecordInText,
                bodySnippet: bodyText.substring(0, 1000).replace(/\n/g, ' ')
            };
        }, idNumber);

        logger.info('[DHS search] Results Info:', JSON.stringify(resultsInfo));

        if (resultsInfo.noRecords || (!resultsInfo.hasDisplayingRecords && !resultsInfo.hasIdInText)) {
            logger.info('[DHS search] Record not found in search results');
            return { found: false, message: 'This ID number was not found on DHS. Please verify if the ID number is correct.' };
        }

        logger.info('[DHS search] Record found! Extracting...');
        // Extract consumer info
        const consumer = await extractConsumerInfo(target);
        
        if (!consumer || !consumer.identityNo) {
            logger.error('[DHS search] Extraction failed');
            return { found: false, message: 'Consumer found but could not extract data' };
        }

        logger.info('[DHS search] Consumer extracted:', JSON.stringify(consumer));

        const result: any = { found: true, consumer, debtCounsellor: undefined };
        
        // If status is Declined, try to get reason
        if (consumer.status && (consumer.status.toLowerCase().includes('declined') || consumer.status.toLowerCase().includes('rejected'))) {
            logger.info('[DHS search] Status is Declined, attempting to get reason...');
            const declineReason = await getDeclineReason(target);
            if (declineReason) {
                result.declineReason = declineReason;
                logger.info('[DHS search] Decline reason extracted:', declineReason);
            }
        }

        logger.info('[DHS search] Final result:', JSON.stringify(result));
        return result;
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
        await page.goto(DHS_CONFIG.requestTransferUrl, { waitUntil: 'load', timeout: DHS_CONFIG.timeout });
        await delay(1000);
        await takeDebugScreenshot('2_request_page_loaded');

        // ── DHS portal error page detection ──────────────────────────────────
        // If DHS threw a server-side error it redirects to dhs_Error.aspx.
        // Detect this BEFORE attempting any further scraping.
        const landedUrl = page.url();
        if (landedUrl.includes('dhs_Error.aspx')) {
            const dhsErrText = await page.evaluate(() => document.body.innerText).catch(() => '');
            logger.error('[DHS auto-fill] Landed on DHS error page:', landedUrl, dhsErrText.substring(0, 300));
            await page.close();
            return {
                success: false,
                message: 'The NCR Debt Help System (DHS) portal returned an error when loading the transfer page. This is a DHS server-side issue — not an application error. Please try again later or check ncrdebthelp.co.za directly.',
            };
        }

        // Enter ID
        const idInputSelectors = [
            '#cp_pagedata_f_RSAIDPass',
            '#ContentPlaceHolder1_txtIdNumber',
            '#ContentPlaceHolder1_txtRSAID',
            'input[id*="RSAID"]',
            'input[name*="RSAID"]',
            'input[id*="txtId"]',
            'input[name*="txtId"]'
        ];

        let idSelector = null;
        for (const sel of idInputSelectors) {
            if (await page.$(sel)) {
                idSelector = sel;
                break;
            }
        }

        if (!idSelector) {
            // Try in frames
            const frames = page.frames();
            for (const frame of frames) {
                for (const sel of idInputSelectors) {
                    if (await frame.$(sel)) {
                        idSelector = sel;
                        break;
                    }
                }
                if (idSelector) break;
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
            '#ContentPlaceHolder1_btnFilter',
            'input[value="Apply Filter"]'
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
            // Try in frames
            const frames = page.frames();
            for (const frame of frames) {
                for (const sel of filterSelectors) {
                    if (await frame.$(sel)) {
                        await frame.evaluate((s) => (document.querySelector(s) as HTMLElement).click(), sel);
                        filterClicked = true;
                        break;
                    }
                }
                if (filterClicked) break;
            }
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
            return { success: false, message: 'This ID number was not found on DHS. Please verify if the ID number is correct.' };
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
                return null;
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
        logger.info('[DHS auto-fill] Fetching DC info from popup...');
        const dcInfo = await getDebtCounsellorInfo(page);
        
        if (dcInfo) {
            detailedInfo.dcFullName = dcInfo.fullName;
            detailedInfo.dcTradingName = dcInfo.tradingName;
            detailedInfo.dcOperatingStatus = dcInfo.operatingStatus;
            detailedInfo.dcMobile = dcInfo.mobile;
            detailedInfo.dcEmail = dcInfo.email;
            detailedInfo.debtCounsellorName = dcInfo.fullName; // Sync both name fields
            logger.info('[DHS auto-fill] DC info extracted successfully');
        } else {
            logger.warn('[DHS auto-fill] Failed to extract DC info from popup');
        }

        // If status is Declined, try to get reason
        if (detailedInfo.status && (detailedInfo.status.toLowerCase().includes('declined') || detailedInfo.status.toLowerCase().includes('rejected'))) {
            logger.info('[DHS auto-fill] Status is Declined, attempting to get reason...');
            const declineReason = await getDeclineReason(page);
            if (declineReason) {
                detailedInfo.declineReason = declineReason;
                logger.info('[DHS auto-fill] Decline reason extracted:', declineReason);
            }
        }

        await page.close();
        return { success: true, data: detailedInfo };

    } catch (error) {
        await page.close();
        return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
}
