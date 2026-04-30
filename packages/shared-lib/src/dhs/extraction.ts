/**
 * DHS (NCR Debt Help System) — Data Extraction Utilities
 * Low-level DOM/network parsing: consumer table rows and decline reason popups.
 */

import fs from 'fs';
import { Page } from 'puppeteer';
import { delay } from './browser';
import type { DHSConsumerInfo, DHSDebtCounsellorInfo } from './types';
import { logger } from '../logger';

/**
 * Extract consumer information from the search results table
 */
export async function extractConsumerInfo(page: any): Promise<DHSConsumerInfo | undefined> {
    try {
        const frame = page.mainFrame ? page.mainFrame() : page;
        
        // Find the results table (usually has class table_settings or contains identityNo header)
        const row = await frame.evaluate(() => {
            const tables = Array.from(document.querySelectorAll('table'));
            const resultsTable = tables.find(t => t.innerText.includes('IDENTITY No') && t.innerText.includes('SURNAME'));
            if (!resultsTable) return null;
            
            // Get the first data row (skip header)
            const rows = Array.from(resultsTable.querySelectorAll('tr'));
            for (const r of rows) {
                const cells = Array.from(r.querySelectorAll('td'));
                // Data rows usually have the ID in the second cell (index 1) and it must be exactly 13 digits
                if (cells.length >= 7) {
                    const cellText = cells[1]?.innerText.trim() || '';
                    if (cellText.match(/^\d{13}$/)) {
                        return r.innerHTML;
                    }
                }
            }
            return null;
        });

        if (!row) {
            // Fallback to simple selector if evaluate failed or returned null
            const simpleRow = await frame.$('.table_settings tbody tr:not(:has(th))');
            if (!simpleRow) return undefined;
            
            const cells = await simpleRow.$$eval('td', tds => tds.map(td => td.textContent?.trim() || ''));
            return mapCellsToConsumer(cells);
        }

        // Parse cells from the found row
        const cells = await frame.evaluate((html: string) => {
            const div = document.createElement('div');
            div.innerHTML = html;
            return Array.from(div.querySelectorAll('td')).map(td => td.textContent?.trim() || '');
        }, row);

        return mapCellsToConsumer(cells);
    } catch (e) {
        logger.error('[DHS extraction] Error:', e);
        return undefined;
    }
}

function mapCellsToConsumer(cells: string[]): DHSConsumerInfo | undefined {
    // Find the ID number column (13 digits)
    const idIndex = cells.findIndex(c => c.trim().match(/^\d{13}$/));
    
    if (idIndex === -1) return undefined;
    
    // Safety: if the cell at idIndex + 1 is "SURNAME", then idIndex was actually the header index!
    if (cells[idIndex + 1]?.toUpperCase().includes('SURNAME')) {
        // Look for the next occurrence starting after this index
        const nextIdIndex = cells.slice(idIndex + 1).findIndex(c => c.trim().match(/^\d{13}$/));
        if (nextIdIndex === -1) return undefined;
        // Recursive call with the remaining cells
        return mapCellsToConsumer(cells.slice(idIndex + 1 + nextIdIndex));
    }
    
    return {
        identityNo: cells[idIndex] || '',
        surname: cells[idIndex + 1] || '',
        firstNames: cells[idIndex + 2] || '',
        gender: cells[idIndex + 3] || '',
        status: cells[idIndex + 4] || '',
        transferIndicator: cells[idIndex + 5] || '',
        debtCounsellor: cells[idIndex + 6] || '',
        province: cells[idIndex + 7] || ''
    };
}

/**
 * Get decline reason from popup (with network interception fallback)
 */
export async function getDeclineReason(page: Page): Promise<string | undefined> {
    try {
        logger.info('=== Attempting to extract decline reason ===');


        // Network Interception Strategy: Capture the response directly
        // This bypasses DOM rendering issues where "Loading..." text persists
        let interceptedDeclineReason = '';
        const debugLogPath = 'public/uploads/dhs_debug_dump.txt';

        // Clear debug log
        try { fs.writeFileSync(debugLogPath, '=== DHS DEBUG LOG STARTED ===\n' + new Date().toISOString() + '\n\n'); } catch (e) { }

        const responseListener = async (response: any) => {
            try {
                // Check if it's an XHR/Fetch or Document request
                const resourceType = response.request().resourceType();
                const url = response.url();

                // Log ALL traffic metadata to identify the target
                try {
                    fs.appendFileSync(debugLogPath, `[${resourceType}] ${url}\n`);
                } catch (e) { }

                // Remove strict resource type filter, just check text
                // if (['xhr', 'fetch', 'document'].includes(resourceType)) {
                if (true) {
                    let text = '';
                    try {
                        text = await response.text();
                    } catch (e) {
                        // Some responses (images, redirects) don't have text
                        return;
                    }

                    if (text && (text.includes('Declined') || text.includes('Transaction performed by'))) {
                        try {
                            // LOG FULL RESPONSE for analysis
                            fs.appendFileSync(debugLogPath, `\n\n!!! FOUND CANDIDATE !!!\n[${resourceType}] ${url}\n`);
                            fs.writeFileSync('public/uploads/dhs_full_response.html', text);
                        } catch (e) { }
                    }

                    // Relaxed Filter: Look for just the footer or the title
                    if (text && (text.includes('View Consumer Transfer Decline Reason') || text.includes('Transaction performed by'))) {
                        logger.info('🎯 NETWORK INTERCEPT: Found potential popup content!');

                        // ROBUST REGEX EXTRACTION (UPDATED based on HTML CLASS)
                        // Use the specific class 'txt_blue_cgothic_13' which wraps the reason.
                        // Structure: <tr ... class="txt_blue_cgothic_13"> ... <td ...> REASON </td>
                        const regex = /class="txt_blue_cgothic_13"[\s\S]*?bgcolor="#FFFFFF">\s*([\s\S]*?)\s*<\/td>/i;
                        const match = text.match(regex);
                        try { fs.appendFileSync(debugLogPath, `Regex Match Result: ${match ? 'MATCHED' : 'FAILED'}\n`); } catch (e) { }

                        if (match && match[1]) {
                            try { fs.appendFileSync(debugLogPath, `Raw Match Group 1: [${match[1]}]\n`); } catch (e) { }
                            // Clean up the extracted text
                            const raw = match[1];
                            // Remove HTML tags
                            const clean = raw.replace(/<[^>]*>/g, ' ')
                                .replace(/&nbsp;/g, ' ')
                                .replace(/\s+/g, ' ')
                                .trim();

                            try { fs.appendFileSync(debugLogPath, `Cleaned Text: [${clean}]\n`); } catch (e) { }

                            if (clean.length > 5) {
                                interceptedDeclineReason = clean;
                                logger.info('🎯 NETWORK INTERCEPT: Extracted reason via Regex:', interceptedDeclineReason);
                            }
                        }

                        // Fallback: If regex failed but we have the footer, try a looser grab
                        if (!interceptedDeclineReason && text.includes('Transaction performed by')) {
                            const parts = text.split('Transaction performed by');
                            const preFooter = parts[0];
                            // Grab the last chunk of text before the footer
                            // Remove tags first
                            const textOnly = preFooter.replace(/<[^>]*>/g, '\n');
                            const lines = textOnly.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                            // The reason is usually the last substantial line before the footer
                            if (lines.length > 0) {
                                interceptedDeclineReason = lines[lines.length - 1];
                                logger.info('🎯 NETWORK INTERCEPT: Extracted reason via loose fallback:', interceptedDeclineReason);
                            }
                        }
                    }
                }
            } catch (e) {
                // Ignore errors reading response body (e.g. redirects)
            }
        };

        // Attach listener
        page.on('response', responseListener);

        // Take screenshot BEFORE clicking

        try {
            const beforeScreenshot = `public/uploads/dhs-before-click-${Date.now()}.png`;
            await page.screenshot({ path: beforeScreenshot, fullPage: true });
            logger.info('Screenshot BEFORE click saved:', beforeScreenshot);
        } catch (e) {
            logger.info('Could not save before-click screenshot:', e);
        }

        // Use evaluate to find and click element using XPath (works in all Puppeteer versions)
        logger.info('Looking for element with text "Declined (Click to View Reason)" using XPath...');

        const clickResult = await page.evaluate(() => {
            // Use XPath to find any element containing this exact text
            const xpathResult = document.evaluate(
                '//*[contains(text(), "Declined") and contains(text(), "Click to View Reason")]',
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            );

            const element = xpathResult.singleNodeValue as HTMLElement | null;

            if (!element) {
                return {
                    success: false,
                    message: 'XPath found no elements'
                };
            }

            // Get element info
            const info = {
                tagName: element.tagName,
                text: element.textContent?.trim(),
                className: element.className,
                id: element.id
            };

            // Try to click it
            try {
                element.click();
                return {
                    success: true,
                    message: 'Element clicked successfully',
                    element: info
                };
            } catch (error) {
                return {
                    success: false,
                    message: 'Click failed: ' + error,
                    element: info
                };
            }
        });

        logger.info('XPath click result:', JSON.stringify(clickResult));

        if (!clickResult.success) {
            logger.info('❌ Could not click element:', clickResult.message);
            return undefined;
        }

        logger.info('✅ Element clicked:', JSON.stringify(clickResult.element));
        logger.info('Waiting 2 seconds for popup to appear...');
        await delay(2000);

        // Take screenshot AFTER clicking
        try {
            const afterScreenshot = `public/uploads/dhs-after-click-${Date.now()}.png`;
            await page.screenshot({ path: afterScreenshot, fullPage: true });
            logger.info('Screenshot AFTER click saved:', afterScreenshot);
        } catch (e) {
            logger.info('Could not save after-click screenshot:', e);
        }



        // Extract reason from popup - simplified robust approach
        logger.info('Starting popup extraction...');
        const declineInfo = await page.evaluate(() => {
            return new Promise<{ success: boolean; fullText?: string; reasonText?: string; error?: string }>((resolve) => {
                try {
                    logger.info('Starting popup extraction (Promise Polling Strategy - Safe Mode v2)...');

                    const safeGetText = (el: Element | null) => el ? (el as HTMLElement).innerText || el.textContent || '' : '';

                    const contentValidator = (text: string) => {
                        const lower = text.toLowerCase();
                        return text.length > 5 &&
                            !lower.includes('view consumer transfer') &&
                            !lower.includes('transaction performed by') &&
                            !lower.includes('loading requested data') &&
                            !lower.includes('please wait');
                    };

                    const pollStart = Date.now();

                    const safeCheckPopup = () => {
                        // 1. Find Title
                        const allElements = Array.from(document.querySelectorAll('*'));
                        let titleElement: Element | null = null;
                        for (const el of allElements) {
                            if (['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName)) continue;
                            const text = safeGetText(el);
                            if (text.length > 500) continue;
                            if (text.toLowerCase().includes('view consumer transfer decline reason')) {
                                titleElement = el;
                                break;
                            }
                        }

                        if (titleElement) {
                            // Check immediate sibling
                            let candidate = titleElement.nextElementSibling;
                            if (candidate) {
                                const txt = safeGetText(candidate);
                                if (contentValidator(txt)) {
                                    logger.info('✅ Found valid content in sibling!');
                                    resolve({ success: true, fullText: txt, reasonText: txt });
                                    return;
                                }
                            }

                            // Check parent sibling
                            if (titleElement.parentElement) {
                                let parentNext = titleElement.parentElement.nextElementSibling;
                                if (parentNext) {
                                    const txt = safeGetText(parentNext);
                                    if (contentValidator(txt)) {
                                        logger.info('✅ Found valid content in parent sibling!');
                                        resolve({ success: true, fullText: txt, reasonText: txt });
                                        return;
                                    }
                                }
                            }

                            // Check container split
                            if (titleElement.parentElement) {
                                const container = titleElement.parentElement.parentElement || titleElement.parentElement;
                                const txt = safeGetText(container);
                                if (txt.toLowerCase().includes('transaction performed by')) {
                                    const parts = txt.split('View Consumer Transfer Decline Reason');
                                    if (parts.length > 1) {
                                        let potential = parts.pop() || '';
                                        potential = potential.replace(/^.*?-\s*\d+\s*/, '').trim();
                                        const footerSplit = potential.split('Transaction performed by');
                                        let finalReason = footerSplit[0].trim();

                                        if (contentValidator(finalReason)) {
                                            logger.info('✅ Found valid content via split!');
                                            resolve({ success: true, fullText: txt, reasonText: finalReason });
                                            return;
                                        }
                                    }
                                }
                            }
                        }

                        // Check timeout
                        if (Date.now() - pollStart > 30000) {
                            resolve({ success: false, error: 'Timed out waiting for decline reason text to load' });
                        } else {
                            setTimeout(safeCheckPopup, 500);
                        }
                    };

                    safeCheckPopup(); // Start polling

                } catch (error) {
                    logger.error('Extraction error:', error);
                    resolve({ success: false, error: String(error) });
                }
            });
        }) as any; // Type assertion to bypass unknown error

        logger.info('Decline info result:', JSON.stringify(declineInfo, null, 2));

        // Network Interception Result Injection
        // If the DOM method failed (timed out or no reason) BUT we caught it on the network, use that!
        if ((!declineInfo || !declineInfo.success || !declineInfo.reasonText) && interceptedDeclineReason) {
            logger.info('🚨 FALLBACK: Using Network Intercepted Decline Reason!');
            return interceptedDeclineReason;
        }

        if (declineInfo && declineInfo.success && declineInfo.reasonText) {
            return declineInfo.reasonText;
        }

        // Try to close popup
        try {
            await page.evaluate(() => {
                // Look for close button - try multiple strategies
                const closeElements = [
                    ...Array.from(document.querySelectorAll('button, a, span')).filter(el => {
                        const text = el.textContent?.toLowerCase() || '';
                        const classes = el.className?.toLowerCase() || '';
                        const title = el.getAttribute('title')?.toLowerCase() || '';
                        return text.includes('close') || text === '×' || text === 'x' ||
                            classes.includes('close') || title.includes('close');
                    })
                ];

                if (closeElements.length > 0) {
                    (closeElements[0] as HTMLElement).click();
                    logger.info('Clicked close button');
                }
            });
            await delay(500);
        } catch {
            // If close button click fails, try Escape key
            logger.info('Close button not found, trying Escape key');
            await page.keyboard.press('Escape');
            await delay(500);
        }

        // Return formatted reason with transaction info
        // Accept ANY reason length, even if it's just "." or empty
        if (declineInfo.success && declineInfo.reasonText !== undefined) {
            let formattedReason = declineInfo.reasonText || '[No reason provided]';
            if (declineInfo.performedBy || declineInfo.performedAt) {
                formattedReason += `\n\nTransaction performed by: ${declineInfo.performedBy || 'Unknown'} `;
                if (declineInfo.performedAt) {
                    formattedReason += ` on ${declineInfo.performedAt} `;
                }
            }
            logger.info('✅ Returning formatted decline reason');
            return formattedReason;
        }

        return undefined;
    } catch (error) {
        logger.error('Error getting decline reason:', error);
        return undefined;
    }
}
