/**
 * XDS (TransUnion XDS) Credit Bureau — Search History Scraper
 *
 * Portal:        https://www.online.xds.co.za
 * History page:  /XDSPortal/History/HistoryMatch
 *
 * Table columns: Enquiry Type | XDS Ref# | Search Output | Executed By | Enquiry Date | View
 * Search Output: "ID_NUMBER | SURNAME | FIRSTNAME"
 */

import { Page } from 'puppeteer';
import { XdsCredentials, XdsCreditReportEntry, XdsHistoryEntry } from './types';
import { logger } from '../logger';
import { delay } from './browser';

// ─── Date Helpers ─────────────────────────────────────────────────────────────

/**
 * Normalise any XDS date string to YYYY-MM-DD.
 * XDS Online format: "2026/04/24 15:12:29"
 */
export function normaliseXdsDate(dateStr: string): string {
    // ISO or slash-separated YYYY/MM/DD
    const ymatch = dateStr.match(/(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
    if (ymatch) return `${ymatch[1]}-${ymatch[2]}-${ymatch[3]}`;
    // DD/MM/YYYY or DD-MM-YYYY
    const dmatch = dateStr.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
    if (dmatch) return `${dmatch[3]}-${dmatch[2]}-${dmatch[1]}`;
    return new Date().toISOString().split('T')[0];
}

// ─── Raw History Scraping ─────────────────────────────────────────────────────

/**
 * Scrape ALL rows from the XDS Search History page (no date filter applied here).
 * Returns raw metadata only — PDFs are downloaded separately.
 */
async function scrapeAllHistoryEntries(
    page: Page,
    portalUrl: string
): Promise<XdsHistoryEntry[]> {
    const historyUrl = `${portalUrl.replace(/\/$/, '')}/XDSPortal/History/HistoryMatch`;
    logger.info(`[XDS] Navigating to history: ${historyUrl}`);

    await page.goto(historyUrl, { waitUntil: 'networkidle2', timeout: 60_000 });
    await delay(2000);

    const raw = await page.evaluate(() => {
        const results: Array<{
            consumerName: string;
            searchDate: string;
            referenceNumber: string | null;
            idNumber: string | null;
            viewLink: string | null;
        }> = [];

        // XDS Online portal table:
        // [0] Enquiry Type | [1] XDS Ref# | [2] Search Output | [3] Executed By | [4] Enquiry Date | [5] View
        const rows = Array.from(document.querySelectorAll('table tbody tr'));

        for (const row of rows) {
            const cells = Array.from(row.querySelectorAll('td'));
            if (cells.length < 5) continue;

            const xdsRef = cells[1]?.innerText?.trim() || null;
            const searchOutput = cells[2]?.innerText?.trim() || '';
            const enquiryDate = cells[4]?.innerText?.trim() || '';

            // "8908115668085 | MASIMONG | THAPELO"
            const parts = searchOutput.split('|').map((s: string) => s.trim());
            const idNumber = parts[0]?.match(/^\d{13}$/) ? parts[0] : null;
            const surname = parts[1] || '';
            const firstName = parts[2] || '';
            const consumerName = [firstName, surname].filter(Boolean).join(' ') || searchOutput;

            // View link — anchor href, onclick, or fallback from ref#
            const viewCell = cells[5];
            let viewLink: string | null = null;

            const anchor = viewCell?.querySelector('a');
            if (anchor) viewLink = anchor.getAttribute('href') || anchor.href || null;

            if (!viewLink) {
                const clickable = viewCell?.querySelector('[onclick]');
                const onclick = clickable?.getAttribute('onclick') || '';
                const m = onclick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);
                if (m) viewLink = m[1];
            }
            if (!viewLink && xdsRef) {
                viewLink = `/XDSPortal/History/ViewEnquiry?ref=${encodeURIComponent(xdsRef)}`;
            }

            if (consumerName && enquiryDate) {
                results.push({ consumerName, searchDate: enquiryDate, referenceNumber: xdsRef, idNumber, viewLink });
            }
        }

        return results;
    });

    const entries: XdsHistoryEntry[] = raw.map(r => ({
        ...r,
        dateKey: normaliseXdsDate(r.searchDate),
    }));

    logger.info(`[XDS] Scraped ${entries.length} total history entries`);
    return entries;
}

// ─── Group by Date ────────────────────────────────────────────────────────────

/**
 * Scrape the full XDS history page and return entries grouped by YYYY-MM-DD date.
 * Keys are sorted oldest-first so the sync can process them in chronological order.
 */
export async function getXdsHistoryGroupedByDate(
    page: Page,
    credentials: XdsCredentials
): Promise<Map<string, XdsHistoryEntry[]>> {
    const allEntries = await scrapeAllHistoryEntries(page, credentials.portalUrl);

    const grouped = new Map<string, XdsHistoryEntry[]>();
    for (const entry of allEntries) {
        if (!grouped.has(entry.dateKey)) grouped.set(entry.dateKey, []);
        grouped.get(entry.dateKey)!.push(entry);
    }

    // Sort oldest → newest
    const sorted = new Map(
        [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))
    );

    logger.info(`[XDS] History spans ${sorted.size} date(s): ${[...sorted.keys()].join(', ')}`);
    return sorted;
}

// ─── PDF Download ─────────────────────────────────────────────────────────────

/**
 * Navigate to the report view page and capture it as a PDF buffer.
 */
async function downloadReportPdf(
    page: Page,
    viewLink: string,
    portalUrl: string
): Promise<Buffer | null> {
    try {
        const fullUrl = viewLink.startsWith('http')
            ? viewLink
            : `${portalUrl.replace(/\/$/, '')}${viewLink.startsWith('/') ? '' : '/'}${viewLink}`;

        logger.info(`[XDS] Navigating to report: ${fullUrl}`);
        await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 60_000 });
        await delay(2000);

        // Try a direct PDF download link on the report page first
        const directPdfUrl = await page.evaluate(() => {
            const a = document.querySelector(
                'a[href*=".pdf"], a[href*="download"], a[href*="Download"], a[href*="Export"]'
            );
            return a ? (a as HTMLAnchorElement).href : null;
        });

        if (directPdfUrl) {
            logger.info(`[XDS] Found direct PDF link: ${directPdfUrl}`);
            const base64 = await page.evaluate(async (url: string) => {
                const res = await fetch(url, { credentials: 'include' });
                if (!res.ok) return null;
                const blob = await res.blob();
                return new Promise<string | null>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? null);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            }, directPdfUrl);

            if (base64) return Buffer.from(base64, 'base64');
        }

        // Fallback: render the page as PDF
        logger.info('[XDS] Rendering report page to PDF');
        const bytes = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
        });
        return Buffer.from(bytes);
    } catch (error) {
        logger.error(`[XDS] PDF download failed for ${viewLink}:`, error);
        return null;
    }
}

/**
 * Download PDFs for a list of history entries and return them as XdsCreditReportEntry[].
 * Used by the sync engine after it has determined which entries to process.
 */
export async function downloadPdfsForEntries(
    page: Page,
    entries: XdsHistoryEntry[],
    portalUrl: string
): Promise<XdsCreditReportEntry[]> {
    const results: XdsCreditReportEntry[] = [];

    for (const entry of entries) {
        if (!entry.viewLink) {
            logger.warn(`[XDS] No view link for ${entry.consumerName} — skipping`);
            continue;
        }

        const pdfBuffer = await downloadReportPdf(page, entry.viewLink, portalUrl);
        if (!pdfBuffer) {
            logger.warn(`[XDS] No PDF captured for ${entry.consumerName} — skipping`);
            continue;
        }

        const safeName = entry.consumerName.replace(/\s+/g, '-').toLowerCase();
        results.push({
            consumerName: entry.consumerName,
            idNumber: entry.idNumber,
            searchDate: entry.searchDate,
            fileName: `xds-credit-report-${safeName}-${Date.now()}.pdf`,
            pdfBuffer,
            referenceNumber: entry.referenceNumber,
        });
    }

    return results;
}

// ─── Legacy single-date function (kept for backward compat) ───────────────────

export function extractIdNumberFromFilename(filename: string): string | null {
    const match = filename.match(/\b(\d{13})\b/);
    return match ? match[1] : null;
}

/** @deprecated Use getXdsHistoryGroupedByDate + downloadPdfsForEntries instead */
export async function scrapeXdsSearchHistory(
    page: Page,
    credentials: XdsCredentials,
    targetDate?: Date
): Promise<XdsCreditReportEntry[]> {
    const grouped = await getXdsHistoryGroupedByDate(page, credentials);
    const targetKey = targetDate
        ? targetDate.toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

    const entries = grouped.get(targetKey) || [];
    logger.info(`[XDS] Legacy scrape for ${targetKey}: ${entries.length} entries`);
    return downloadPdfsForEntries(page, entries, credentials.portalUrl);
}
