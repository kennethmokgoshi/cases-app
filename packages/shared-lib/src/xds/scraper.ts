/**
 * XDS (TransUnion XDS) Credit Bureau — Search History Scraper
 * Navigates to Search History, lists today's credit reports, and downloads each PDF.
 */

import { Page } from 'puppeteer';
import { XdsCredentials, XdsCreditReportEntry } from './types';
import { logger } from '../logger';
import { delay } from './browser';

/**
 * Navigate to the XDS Search History page and scrape all entries from today.
 * Returns a list of report metadata (without PDFs downloaded yet).
 */
async function getSearchHistoryEntries(
    page: Page,
    portalUrl: string
): Promise<Array<{ consumerName: string; searchDate: string; referenceNumber: string | null; downloadLink: string | null }>> {
    const searchHistoryUrl = `${portalUrl.replace(/\/$/, '')}/search-history`;
    logger.info(`[XDS] Navigating to search history: ${searchHistoryUrl}`);

    await page.goto(searchHistoryUrl, { waitUntil: 'networkidle2', timeout: 60_000 });
    await delay(2000);

    // Try to detect table or list of search history
    // XDS portals typically render a table with columns: Date | Consumer Name | ID Number | Reference | Actions
    const entries = await page.evaluate(() => {
        const results: Array<{
            consumerName: string;
            searchDate: string;
            referenceNumber: string | null;
            idNumber: string | null;
            downloadLink: string | null;
        }> = [];

        // Strategy 1: Standard <table> rows
        const rows = Array.from(document.querySelectorAll('table tbody tr, .search-history-table tr, .history-table tr'));

        for (const row of rows) {
            const cells = Array.from(row.querySelectorAll('td'));
            if (cells.length < 2) continue;

            // Try to find date, name, and a download link
            const cellTexts = cells.map(c => c.innerText?.trim() || '');

            // Look for a cell that looks like a date (contains / or -)
            const dateCell = cellTexts.find(t => /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(t) || /\d{4}-\d{2}-\d{2}/.test(t));

            // Name is often the longest non-date, non-numeric cell
            const nameCell = cellTexts.find(t =>
                t.length > 2 &&
                !(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(t)) &&
                !(/^\d+$/.test(t))
            );

            // Reference number — purely numeric or alphanumeric short string
            const refCell = cellTexts.find(t => /^[A-Z0-9\-]{4,20}$/i.test(t) && t !== nameCell && t !== dateCell);

            // ID Number — 13 digit numeric
            const idCell = cellTexts.find(t => /^\d{13}$/.test(t));

            // Download link
            const downloadAnchor = row.querySelector('a[href*=".pdf"], a[href*="download"], a[href*="report"], button[data-action="download"]');
            const downloadLink = downloadAnchor
                ? (downloadAnchor as HTMLAnchorElement).href || (downloadAnchor as HTMLElement).dataset['href'] || null
                : null;

            if (nameCell && dateCell) {
                results.push({
                    consumerName: nameCell,
                    searchDate: dateCell,
                    referenceNumber: refCell || null,
                    idNumber: idCell || null,
                    downloadLink,
                });
            }
        }

        // Strategy 2: List items / cards (some portals use card layouts)
        if (results.length === 0) {
            const cards = Array.from(document.querySelectorAll('.history-item, .report-card, [data-testid*="history"], .search-result-item'));
            for (const card of cards) {
                const nameEl = card.querySelector('.consumer-name, .name, h3, h4, [data-field="name"]');
                const dateEl = card.querySelector('.date, .search-date, [data-field="date"], time');
                const refEl = card.querySelector('.reference, .ref, [data-field="reference"]');
                const idEl = card.querySelector('.id-number, [data-field="id"]');
                const downloadAnchor = card.querySelector('a[href*=".pdf"], a[href*="download"], button[data-action="download"]');

                if (nameEl) {
                    results.push({
                        consumerName: nameEl.textContent?.trim() || '',
                        searchDate: dateEl?.textContent?.trim() || new Date().toISOString().split('T')[0],
                        referenceNumber: refEl?.textContent?.trim() || null,
                        idNumber: idEl?.textContent?.trim().replace(/\s/g, '') || null,
                        downloadLink: downloadAnchor
                            ? (downloadAnchor as HTMLAnchorElement).href || null
                            : null,
                    });
                }
            }
        }

        return results;
    });

    logger.info(`[XDS] Found ${entries.length} entries in search history`);
    return entries;
}

/**
 * Filter entries to only those from today (or a specific date).
 */
function filterToday(
    entries: Array<{ consumerName: string; searchDate: string; referenceNumber: string | null; idNumber: string | null; downloadLink: string | null }>,
    targetDate?: Date
): typeof entries {
    const target = targetDate || new Date();
    const todayStr = target.toISOString().split('T')[0]; // YYYY-MM-DD

    return entries.filter(entry => {
        const dateStr = entry.searchDate;
        // Match against YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, MM/DD/YYYY
        if (dateStr.includes(todayStr)) return true;

        const [d, m, y] = dateStr.split(/[\/\-]/).map(Number);
        if (!d || !m || !y) return true; // can't parse — include it

        const fullYear = y < 100 ? 2000 + y : y;
        const parsed = new Date(fullYear, m - 1, d);
        const parsedStr = parsed.toISOString().split('T')[0];
        return parsedStr === todayStr;
    });
}

/**
 * Download a credit report PDF by navigating to its download link.
 * Returns the PDF as a Buffer.
 */
async function downloadReportPdf(
    page: Page,
    downloadLink: string,
    portalUrl: string
): Promise<Buffer | null> {
    try {
        // Resolve relative URLs
        const fullUrl = downloadLink.startsWith('http')
            ? downloadLink
            : `${portalUrl.replace(/\/$/, '')}${downloadLink.startsWith('/') ? '' : '/'}${downloadLink}`;

        logger.info(`[XDS] Downloading report: ${fullUrl}`);

        // Use CDP to intercept the download as binary
        const client = await page.createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'deny', // We capture via fetch instead
        });

        // Fetch the PDF using page.evaluate with fetch API (preserves auth cookies)
        const base64Pdf = await page.evaluate(async (url: string) => {
            const res = await fetch(url, { credentials: 'include' });
            if (!res.ok) return null;
            const blob = await res.blob();
            return new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve((reader.result as string).split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }, fullUrl);

        if (!base64Pdf) {
            logger.warn(`[XDS] Empty response for ${fullUrl}`);
            return null;
        }

        return Buffer.from(base64Pdf, 'base64');
    } catch (error) {
        logger.error(`[XDS] Download failed for ${downloadLink}:`, error);
        return null;
    }
}

/**
 * Attempt to extract the South African ID number from a PDF buffer using text search.
 * Returns null if not found (caller can use AI analysis as fallback).
 */
export function extractIdNumberFromFilename(filename: string): string | null {
    // Many XDS filenames include the ID number: e.g. "CreditReport_8001015800085.pdf"
    const match = filename.match(/\b(\d{13})\b/);
    return match ? match[1] : null;
}

/**
 * Main scraping function.
 * Logs in, visits search history, downloads today's reports, returns them as buffers.
 */
export async function scrapeXdsSearchHistory(
    page: Page,
    credentials: XdsCredentials,
    targetDate?: Date
): Promise<XdsCreditReportEntry[]> {
    const entries = await getSearchHistoryEntries(page, credentials.portalUrl);
    const todayEntries = filterToday(entries as any, targetDate);

    logger.info(`[XDS] ${todayEntries.length} reports match target date`);

    const results: XdsCreditReportEntry[] = [];

    for (const entry of todayEntries) {
        logger.info(`[XDS] Processing: ${entry.consumerName}`);

        let pdfBuffer: Buffer | null = null;

        if (entry.downloadLink) {
            pdfBuffer = await downloadReportPdf(page, entry.downloadLink, credentials.portalUrl);
        }

        if (!pdfBuffer) {
            logger.warn(`[XDS] No PDF downloaded for ${entry.consumerName} — skipping`);
            continue;
        }

        // Try to extract ID from filename first, then from the entry, then leave null for AI
        const idFromFilename = extractIdNumberFromFilename(entry.downloadLink || '');
        const idNumber = (entry as any).idNumber || idFromFilename || null;

        const fileName = `xds-credit-report-${entry.consumerName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`;

        results.push({
            consumerName: entry.consumerName,
            idNumber,
            searchDate: entry.searchDate,
            fileName,
            pdfBuffer,
            referenceNumber: entry.referenceNumber,
        });
    }

    logger.info(`[XDS] Scraping complete — ${results.length} reports with PDFs`);
    return results;
}
