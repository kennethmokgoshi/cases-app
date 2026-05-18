/**
 * DHS (NCR Debt Help System) — Data Extraction Utilities
 * Low-level DOM parsing: consumer table rows and decline reason page navigation.
 */

import { Page } from 'puppeteer';
import { delay } from './browser';
import type { DHSConsumerInfo } from './types';
import { logger } from '../logger';

/**
 * Extract consumer information from the search results table
 */
export async function extractConsumerInfo(page: any): Promise<DHSConsumerInfo | undefined> {
    try {
        const frame = page.mainFrame ? page.mainFrame() : page;

        const row = await frame.evaluate(() => {
            const tables = Array.from(document.querySelectorAll('table'));
            const resultsTable = tables.find(t => t.innerText.includes('IDENTITY No') && t.innerText.includes('SURNAME'));
            if (!resultsTable) return null;

            const rows = Array.from(resultsTable.querySelectorAll('tr'));
            for (const r of rows) {
                const cells = Array.from(r.querySelectorAll('td'));
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
            const simpleRow = await frame.$('.table_settings tbody tr:not(:has(th))');
            if (!simpleRow) return undefined;
            const cells = await simpleRow.$$eval('td', tds => tds.map(td => td.textContent?.trim() || ''));
            return mapCellsToConsumer(cells);
        }

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
    const idIndex = cells.findIndex(c => c.trim().match(/^\d{13}$/));
    if (idIndex === -1) return undefined;

    if (cells[idIndex + 1]?.toUpperCase().includes('SURNAME')) {
        const nextIdIndex = cells.slice(idIndex + 1).findIndex(c => c.trim().match(/^\d{13}$/));
        if (nextIdIndex === -1) return undefined;
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
 * Get decline reason by navigating directly to dhs_ConsumerTransferDeclineComments.aspx.
 *
 * The DHS "Declined (Click to View Reason)" element is a <div> with an onclick:
 *   ShowUserManagementPage('dhs_ConsumerTransferDeclineComments.aspx?id=XXXXX&pg=0', '...')
 *
 * Instead of trying to interact with a modal popup, we extract the URL from the onclick
 * attribute and navigate to the page directly — much more reliable.
 */
export async function getDeclineReason(page: Page): Promise<string | undefined> {
    try {
        logger.info('=== Attempting to extract decline reason ===');

        // Step 1: Find the decline reason page URL from the onclick attribute
        const declinePageUrl = await page.evaluate(`(function() {
            var els = Array.from(document.querySelectorAll('[onclick]'));
            for (var i = 0; i < els.length; i++) {
                var oc = els[i].getAttribute('onclick') || '';
                if (oc.includes('ConsumerTransferDeclineComments')) {
                    var match = oc.match(/ShowUserManagementPage\\(['"]([^'"]+)['"]/);
                    if (match) return match[1];
                }
            }
            return null;
        })()`);

        if (!declinePageUrl) {
            logger.info('❌ No ConsumerTransferDeclineComments URL found on page');
            return undefined;
        }

        const fullUrl = `https://www.ncrdebthelp.co.za/${declinePageUrl}`;
        logger.info('✅ Found decline reason URL:', fullUrl);

        // Step 2: Navigate directly to the decline comments page (no modal interaction needed)
        await page.goto(fullUrl, { waitUntil: 'load', timeout: 60000 });
        await delay(1500);

        // Step 3: Scrape the reason from the page
        const reason = await page.evaluate(`(function() {
            // Try known DHS class for reason text rows
            var blueRows = Array.from(document.querySelectorAll('.txt_blue_cgothic_13 td, .txt_blue_cgothic_13'));
            for (var i = 0; i < blueRows.length; i++) {
                var t = (blueRows[i].innerText || blueRows[i].textContent || '').trim();
                if (t.length > 3) return t;
            }
            // Fallback: most content-rich short table cell that's not a header/footer
            var best = '';
            var cells = Array.from(document.querySelectorAll('td'));
            for (var j = 0; j < cells.length; j++) {
                var ct = (cells[j].innerText || cells[j].textContent || '').trim();
                var lower = ct.toLowerCase();
                if (ct.length > best.length &&
                    ct.length < 500 &&
                    !lower.includes('national credit regulator') &&
                    !lower.includes('debt help system') &&
                    !lower.includes('welcome') &&
                    !lower.includes('transaction performed by') &&
                    !lower.includes('view consumer transfer')) {
                    best = ct;
                }
            }
            return best || null;
        })()`);

        if (reason && (reason as string).length > 3) {
            const cleaned = (reason as string).replace(/\s+/g, ' ').trim();
            logger.info('✅ Decline reason extracted:', cleaned);
            return cleaned;
        }

        logger.info('❌ Could not extract reason from decline page');
        return undefined;
    } catch (error) {
        logger.error('Error getting decline reason:', error);
        return undefined;
    }
}
