/**
 * DHS (NCR Debt Help System) — Debt Counsellor Lookup
 * Extracts debt counsellor details from the DHS popup.
 */

import { Page } from 'puppeteer';
import { delay } from './browser';
import type { DHSDebtCounsellorInfo } from './types';
import { logger } from '../logger';

/**
 * Get debt counsellor details from the DHS popup
 */
export async function getDebtCounsellorInfo(page: any): Promise<DHSDebtCounsellorInfo | undefined> {
    try {
        const frame = page.mainFrame ? page.mainFrame() : page;
        
        // Find and click the DC link (8th column or by NCRDC text)
        let clicked = false;
        try {
            // Strategy 1: Find cell containing NCRDC and click it directly via text selector
            const dcText = await frame.evaluate(() => {
                const cells = Array.from(document.querySelectorAll('td'));
                const dcCell = cells.find(c => c.innerText.trim().startsWith('NCRDC'));
                return dcCell?.innerText.trim();
            });

            if (dcText) {
                logger.info(`[DHS counsellor] Clicking DC link via text: ${dcText}`);
                await frame.click(`text/${dcText}`);
                clicked = true;
            }
        } catch (e) {
            logger.info('[DHS counsellor] Text click failed, trying evaluate click');
        }

        if (!clicked) {
            clicked = await frame.evaluate(() => {
                const tables = Array.from(document.querySelectorAll('table'));
                const resultsTable = tables.find(t => t.innerText.includes('IDENTITY No') && t.innerText.includes('DEBT COUN.'));
                if (!resultsTable) return false;
                
                const rows = Array.from(resultsTable.querySelectorAll('tr'));
                for (const r of rows) {
                    const cells = Array.from(r.querySelectorAll('td'));
                    const dcCell = cells.find(c => c.innerText.trim().startsWith('NCRDC'));
                    if (dcCell) {
                        const link = dcCell.querySelector('a') || dcCell;
                        (link as HTMLElement).click();
                        return true;
                    }
                }
                return false;
            });
        }

        if (!clicked) {
            logger.info('[DHS counsellor] No DC link found to click');
            return undefined;
        }

        logger.info('[DHS counsellor] Clicked DC link, waiting 3s for popup...');
        await delay(3000); // Increased wait

        // Extract DC info from popup - search in target and all child frames
        const extractFromContext = async (ctx: any) => {
            const rawResults = await ctx.evaluate(() => {
                try {
                    const results: Record<string, string> = {};
                    const bodyText = document.body.innerText;
                    // Split into lines and clean up
                    const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                    
                    // The structure is: 
                    // Row 0: Labels (e.g. NCR Registration No, Full Name, Operating Status)
                    // Row 1: Values (e.g. NCRDC2351, Sebastien Alexanderson, Operating)
                    // Row 2: Labels (e.g. Province, Trading Name, Tel)
                    // Row 3: Values (e.g. Western Cape, National Debt Advisors, 0210038733)
                    
                    for (let i = 0; i < lines.length - 1; i += 2) {
                        const labels = lines[i].split(/\t|\s{2,}/).map(l => l.trim());
                        const values = lines[i+1].split(/\t|\s{2,}/).map(v => v.trim());
                        
                        labels.forEach((label, idx) => {
                            const cleanLabel = label.replace(':', '').trim();
                            if (cleanLabel && values[idx] !== undefined) {
                                results[cleanLabel] = values[idx];
                            }
                        });
                    }

                    // Special check for links (Email/Mobile) which might not show up in innerText correctly
                    const allLinks = Array.from(document.querySelectorAll('a'));
                    allLinks.forEach(link => {
                        const href = link.getAttribute('href') || '';
                        if (href.startsWith('mailto:')) {
                            results['Email'] = href.replace('mailto:', '').trim();
                        } else if (href.startsWith('tel:')) {
                            const tel = href.replace('tel:', '').trim();
                            // Only set mobile if it's longer than a standard tel or if Mobile label was found
                            if (!results['Mobile']) results['Mobile'] = tel;
                        }
                    });

                    return results;
                } catch (e) {
                    return { error: String(e) };
                }
            });

            logger.info('[DHS DC Popup] Extracted Map:', JSON.stringify(rawResults));

            return {
                fullName: rawResults['Full Name'] || '',
                registrationNo: rawResults['NCR Registration No'] || '',
                tradingName: rawResults['Trading Name'] || '',
                operatingStatus: rawResults['Operating Status'] || '',
                tel: rawResults['Tel'] || '',
                fax: rawResults['Fax'] || '',
                mobile: rawResults['Mobile'] || '',
                email: rawResults['Email'] || '',
                raw: rawResults
            };
        };

        let info = await extractFromContext(frame);
        
        if (!info || !info.registrationNo) {
            logger.info('[DHS counsellor] Not found in main frame, searching child frames...');
            const childFrames = frame.childFrames();
            logger.info(`[DHS counsellor] Found ${childFrames.length} child frames`);
            for (const child of childFrames) {
                const url = child.url();
                const bodyText = await child.evaluate(() => document.body?.innerText || '');
                const textLen = bodyText.length;
                logger.info(`[DHS counsellor] Checking child frame: ${url} (length: ${textLen})`);
                
                if (textLen > 0 && textLen < 500) {
                    logger.info(`[DHS counsellor] Frame text snippet: ${bodyText.substring(0, 200).replace(/\n/g, ' ')}`);
                }

                info = await extractFromContext(child);
                if (info) {
                    logger.info(`[DHS counsellor] Found info in child frame: ${url}`);
                    break;
                }
            }
        }

        if (!info) {
            logger.info('[DHS counsellor] Could not extract info from popup');
            return undefined;
        }

        // Try to close popup
        try {
            await frame.evaluate(() => {
                const closeBtn = document.querySelector('.modal .close, .popup .close, button[value="X"], #cp_pagedata_btnHide') as HTMLElement;
                if (closeBtn) closeBtn.click();
            });
        } catch (e) {}

        return info;
    } catch (e) {
        logger.error('[DHS counsellor] Error:', e);
        return undefined;
    }
}
