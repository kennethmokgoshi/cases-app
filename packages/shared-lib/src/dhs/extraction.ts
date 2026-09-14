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
 * A DHS decline, as recorded on dhs_ConsumerTransferDeclineComments.aspx.
 *
 * The page footer carries the transaction line that says WHEN the current DC
 * actually declined the transfer — e.g.
 *   "Transaction performed by Benay Sager  @ 2026-09-04 14:02:07 PM"
 * That timestamp is the real decline date. Without it we can only record the day
 * we happened to run the check, which makes a months-old decline look like it
 * happened today.
 */
export interface DHSDeclineDetails {
    /** The decline reason text shown to the requesting DC. */
    reason: string;
    /** Name of the DC-side user who performed the decline, when the footer carries it. */
    performedBy?: string;
    /** When DHS recorded the decline (parsed from the footer, read as SAST). */
    declinedAt?: Date;
}

/** DHS renders all timestamps in South African Standard Time (UTC+02:00). */
const SAST_OFFSET_HOURS = 2;

/**
 * Parse the "Transaction performed by <name> @ <timestamp>" footer of a DHS
 * decline page.
 *
 * DHS writes the clock in 24-hour form but still appends AM/PM ("14:02:07 PM"),
 * so the meridiem is only honoured when the hour is genuinely a 12-hour value.
 * The timestamp is stamped as SAST so the stored instant is correct regardless
 * of the server's own timezone.
 */
export function parseDeclineTransactionFooter(
    footer: string | null | undefined
): { performedBy?: string; declinedAt?: Date } {
    if (!footer) return {};

    const match = footer.match(
        /Transaction\s+performed\s+by\s*:?\s*(.*?)\s*@\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i
    );
    if (!match) return {};

    const [, rawName, year, month, day, rawHour, minute, second, meridiem] = match;

    let hour = parseInt(rawHour, 10);
    const upper = (meridiem || '').toUpperCase();
    // Only a real 12-hour reading gets shifted — "14:02 PM" is already 24-hour.
    if (upper === 'PM' && hour < 12) hour += 12;
    if (upper === 'AM' && hour === 12) hour = 0;

    const declinedAt = new Date(
        Date.UTC(
            parseInt(year, 10),
            parseInt(month, 10) - 1,
            parseInt(day, 10),
            hour - SAST_OFFSET_HOURS,
            parseInt(minute, 10),
            second ? parseInt(second, 10) : 0
        )
    );

    const performedBy = (rawName || '').replace(/\s+/g, ' ').trim() || undefined;

    // Reject anything nonsensical rather than poisoning the case record: a bad
    // parse must fall back to "now", never to a date DHS could not have written.
    if (Number.isNaN(declinedAt.getTime())) return { performedBy };
    if (declinedAt.getUTCFullYear() < 2000) return { performedBy };
    if (declinedAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) return { performedBy };

    return { performedBy, declinedAt };
}

/**
 * Get the decline reason and its transaction footer by navigating directly to
 * dhs_ConsumerTransferDeclineComments.aspx.
 *
 * The DHS "Declined (Click to View Reason)" element is a <div> with an onclick:
 *   ShowUserManagementPage('dhs_ConsumerTransferDeclineComments.aspx?id=XXXXX&pg=0', '...')
 *
 * Instead of trying to interact with a modal popup, we extract the URL from the onclick
 * attribute and navigate to the page directly — much more reliable.
 */
export async function getDeclineDetails(page: Page): Promise<DHSDeclineDetails | undefined> {
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

        // Step 3: Scrape the reason AND the "Transaction performed by ... @ ..." footer
        const scraped = (await page.evaluate(`(function() {
            var reason = null;
            // Try known DHS class for reason text rows
            var blueRows = Array.from(document.querySelectorAll('.txt_blue_cgothic_13 td, .txt_blue_cgothic_13'));
            for (var i = 0; i < blueRows.length; i++) {
                var t = (blueRows[i].innerText || blueRows[i].textContent || '').trim();
                if (t.length > 3) { reason = t; break; }
            }
            if (!reason) {
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
                reason = best || null;
            }

            // The footer sits in its own element — take the SMALLEST element that
            // contains it so we capture the transaction line, not the whole page.
            var footer = '';
            var candidates = Array.from(document.querySelectorAll('td, div, span, p'));
            for (var k = 0; k < candidates.length; k++) {
                var ft = (candidates[k].innerText || candidates[k].textContent || '').trim();
                if (ft.indexOf('Transaction performed by') !== -1 && ft.length < 400) {
                    if (!footer || ft.length < footer.length) footer = ft;
                }
            }

            return { reason: reason, footer: footer || null };
        })()`)) as { reason: string | null; footer: string | null } | null;

        if (!scraped || !scraped.reason || scraped.reason.length <= 3) {
            logger.info('❌ Could not extract reason from decline page');
            return undefined;
        }

        const cleaned = scraped.reason.replace(/\s+/g, ' ').trim();
        const { performedBy, declinedAt } = parseDeclineTransactionFooter(scraped.footer);

        logger.info('✅ Decline reason extracted:', cleaned);
        if (declinedAt) {
            logger.info(
                `✅ Decline transaction footer parsed — performed by ${performedBy || 'unknown'} at ${declinedAt.toISOString()}`
            );
        } else {
            logger.info('⚠️ No usable "Transaction performed by ... @ ..." footer on the decline page');
        }

        return { reason: cleaned, performedBy, declinedAt };
    } catch (error) {
        logger.error('Error getting decline reason:', error);
        return undefined;
    }
}

/**
 * Backwards-compatible wrapper returning the reason text only.
 * Prefer getDeclineDetails() wherever the decline date matters.
 */
export async function getDeclineReason(page: Page): Promise<string | undefined> {
    const details = await getDeclineDetails(page);
    return details?.reason;
}
