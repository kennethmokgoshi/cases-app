/**
 * DHS — Consumer Status History (Clearance Detection)
 *
 * Reads the "View Consumer Status History" popup on the DHS Search & Manage
 * Consumer page (dhs_SearchManageConsumer.aspx) and identifies whether a
 * consumer has reached a status that means they are OUT of debt review and
 * therefore eligible for flag clearance.
 *
 * Clearance-eligible status codes (per business): A1, B, F1, F2, G, G1.
 * (e.g. code "G" = "Magistrate rescinded the debt review court order / consumer
 *  declared not over-indebted — Option C on Form 17.W".)
 *
 * Workflow mapping, based on the consumer's CURRENT (most recent) status code:
 *   • A1, B, F1, F2, G, G1 (out of debt review):
 *       - < 7 calendar days since the status date → READY_CLEARANCE
 *       - ≥ 7 calendar days                       → COMPLETED
 *   • A, C, D3, D4 (active debt review / transfer accepted) → ACCEPTED_VIA_DHS
 *
 * It deliberately stops at COMPLETED (not SETTLED): there is no finance
 * integration yet to confirm payment. A later automation will reconcile with
 * finance + DHS before a case can be settled.
 *
 * SCOPE: this module only *identifies* the statuses and classifies the would-be
 * workflow status. It does NOT mutate any case — that is the job of the future
 * clearance automation, which will consume evaluateConsumerClearance().
 *
 * The DOM-parsing logic (parseStatusHistoryRows) is kept pure and separate from
 * the Puppeteer scraper so it can be unit-tested without a live browser.
 */

import type { Page } from 'puppeteer';
import { getBrowser, loginToDHS, delay, DHS_CONFIG } from './browser';
import { getDHSCredentials } from '../integrations';
import { logger } from '../logger';

// ─── Constants ──────────────────────────────────────────────────────────────

/** DHS consumer status codes that mark a consumer as out of debt review / eligible for clearance. */
export const CLEARANCE_ELIGIBLE_CODES = ['A1', 'B', 'F1', 'F2', 'G', 'G1'] as const;
export type ClearanceEligibleCode = (typeof CLEARANCE_ELIGIBLE_CODES)[number];

/** Cut-off (calendar days since the status date) between Ready for Clearance and Completed. */
export const CLEARANCE_READY_WINDOW_DAYS = 7;

/**
 * DHS consumer status codes that mean the consumer is in ACTIVE debt review
 * under our debt counsellor — i.e. the transfer is effectively accepted on DHS.
 */
export const ACCEPTED_VIA_DHS_CODES = ['A', 'C', 'D3', 'D4'] as const;
export type AcceptedViaDhsCode = (typeof ACCEPTED_VIA_DHS_CODES)[number];

const ELIGIBLE_SET = new Set<string>(CLEARANCE_ELIGIBLE_CODES);
const ACCEPTED_SET = new Set<string>(ACCEPTED_VIA_DHS_CODES);

// ─── Types ──────────────────────────────────────────────────────────────────

/** A single row from the consumer status history table. */
export interface StatusHistoryEntry {
    /** Normalised status code, e.g. "G", "A1". */
    code: string;
    /** Full status description text. */
    description: string;
    /** Raw status date string as scraped, e.g. "2026-05-07 15:02:06". */
    rawDate: string;
    /** Parsed date (local midnight) or null if it could not be parsed. */
    statusDate: Date | null;
}

/** The outcome of evaluating a consumer's status history for clearance readiness. */
export interface ClearanceEvaluation {
    /** True if the consumer's current (most recent) status is a clearance-eligible code. */
    eligible: boolean;
    /** The current (most recent) status code, or null if no entries. */
    currentCode: string | null;
    /** Description of the qualifying status, if eligible. */
    matchedDescription: string | null;
    /** Date of the qualifying status, if eligible and parseable. */
    statusDate: Date | null;
    /** Calendar days since the qualifying status date. */
    daysSinceStatus: number | null;
    /** Workflow status this maps to, or null when the code is not recognised / date unknown. */
    workflowStatus: 'READY_CLEARANCE' | 'COMPLETED' | 'ACCEPTED_VIA_DHS' | null;
    /** Human-readable explanation(s) of the decision. */
    notes: string[];
    /** All parsed status history entries (for transparency / later automation). */
    entries: StatusHistoryEntry[];
}

/** Result of a live DHS consumer status-history check. */
export interface ConsumerStatusHistoryResult {
    found: boolean;
    idNumber: string;
    evaluation: ClearanceEvaluation;
    message: string;
    screenshot?: string;
}

// ─── Pure helpers (unit-testable) ─────────────────────────────────────────────

/** Normalise a raw status-code cell into a comparable code, e.g. " g1 " → "G1". */
export function normalizeStatusCode(raw: string): string {
    return (raw ?? '').replace(/\s+/g, '').toUpperCase();
}

/** True if the given code (case/whitespace-insensitive) is a clearance-eligible code. */
export function isClearanceEligibleCode(code: string): boolean {
    return ELIGIBLE_SET.has(normalizeStatusCode(code));
}

/** True if the code means the consumer is in active debt review → Accepted via DHS. */
export function isAcceptedViaDhsCode(code: string): boolean {
    return ACCEPTED_SET.has(normalizeStatusCode(code));
}

/**
 * Parse a DHS status-date string into a Date at local midnight.
 * Accepts "2026-05-07" or "2026-05-07 15:02:06"; returns null if no valid date found.
 */
export function parseDhsDate(raw: string): Date | null {
    if (!raw) return null;
    const m = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day);
    // Reject impossible dates that JS would roll over (e.g. 2026-02-31).
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return d;
}

/** Whole calendar days between a status date and "now" (ignoring time-of-day). */
export function daysSinceCalendar(statusDate: Date, now: Date = new Date()): number {
    const a = Date.UTC(statusDate.getFullYear(), statusDate.getMonth(), statusDate.getDate());
    const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.floor((b - a) / 86400000);
}

/** Map "days since the qualifying status date" to the workflow status. */
export function classifyClearanceWorkflowStatus(daysSinceStatus: number): 'READY_CLEARANCE' | 'COMPLETED' {
    return daysSinceStatus < CLEARANCE_READY_WINDOW_DAYS ? 'READY_CLEARANCE' : 'COMPLETED';
}

/**
 * Parse raw table rows (array of cell-text arrays) from the status history table
 * into structured entries. Header rows and blank rows are skipped.
 *
 * The DHS table has three columns: CODE | STATUS DESCRIPTION | STATUS DATE.
 * Parsing is defensive about column order: the date cell is found by pattern,
 * the code is the first cell, and the description is the longest remaining cell.
 */
export function parseStatusHistoryRows(rows: string[][]): StatusHistoryEntry[] {
    const entries: StatusHistoryEntry[] = [];

    for (const cells of rows) {
        const clean = cells.map(c => (c ?? '').replace(/\s+/g, ' ').trim());
        if (clean.every(c => c === '')) continue;

        const joined = clean.join(' ').toUpperCase();
        // Skip the header row.
        if (joined.includes('STATUS DESCRIPTION') || (joined.includes('CODE') && joined.includes('STATUS DATE'))) {
            continue;
        }

        const rawDate = clean.find(c => /\d{4}-\d{2}-\d{2}/.test(c)) ?? '';
        const code = clean[0] ?? '';
        const description =
            clean
                .filter(c => c !== code && c !== rawDate && c !== '')
                .sort((a, b) => b.length - a.length)[0] ?? (clean[1] ?? '');

        if (!code && !description && !rawDate) continue;

        entries.push({
            code: normalizeStatusCode(code),
            description,
            rawDate,
            statusDate: parseDhsDate(rawDate),
        });
    }

    return entries;
}

/**
 * Evaluate a consumer's parsed status history for clearance readiness.
 *
 * The consumer is "eligible" when their CURRENT (most recent) status code is one
 * of the clearance-eligible codes. The workflow status is then derived from how
 * old that status date is.
 */
export function evaluateConsumerClearance(
    entries: StatusHistoryEntry[],
    now: Date = new Date()
): ClearanceEvaluation {
    const notes: string[] = [];
    const evaluation: ClearanceEvaluation = {
        eligible: false,
        currentCode: null,
        matchedDescription: null,
        statusDate: null,
        daysSinceStatus: null,
        workflowStatus: null,
        notes,
        entries,
    };

    if (entries.length === 0) {
        notes.push('No status history entries found.');
        return evaluation;
    }

    // Most recent status first (entries without a parseable date sort to the end).
    const sorted = [...entries].sort((a, b) => {
        const ta = a.statusDate ? a.statusDate.getTime() : -Infinity;
        const tb = b.statusDate ? b.statusDate.getTime() : -Infinity;
        return tb - ta;
    });
    const latest = sorted[0];
    evaluation.currentCode = latest.code || null;

    if (!isClearanceEligibleCode(latest.code)) {
        // Active debt review codes → Accepted via DHS (not a clearance state).
        if (isAcceptedViaDhsCode(latest.code)) {
            evaluation.matchedDescription = latest.description || null;
            evaluation.statusDate = latest.statusDate;
            evaluation.workflowStatus = 'ACCEPTED_VIA_DHS';
            notes.push(
                `Current status code "${latest.code}" means the consumer is in active debt review ` +
                    `(accepted codes: ${ACCEPTED_VIA_DHS_CODES.join(', ')}) → Accepted via DHS.`
            );
            return evaluation;
        }
        notes.push(
            `Current status code "${latest.code || '(blank)'}" is not a recognised clearance ` +
                `(${CLEARANCE_ELIGIBLE_CODES.join(', ')}) or accepted (${ACCEPTED_VIA_DHS_CODES.join(', ')}) code.`
        );
        return evaluation;
    }

    evaluation.eligible = true;
    evaluation.matchedDescription = latest.description || null;
    evaluation.statusDate = latest.statusDate;

    if (!latest.statusDate) {
        notes.push(
            `Clearance-eligible code "${latest.code}" found, but its status date could not be parsed ` +
                `("${latest.rawDate}") — cannot classify Ready for Clearance vs Completed.`
        );
        return evaluation;
    }

    const days = daysSinceCalendar(latest.statusDate, now);
    evaluation.daysSinceStatus = days;
    evaluation.workflowStatus = classifyClearanceWorkflowStatus(days);
    notes.push(
        `Clearance-eligible code "${latest.code}" dated ${latest.rawDate} (${days} calendar day(s) ago) → ` +
            `${evaluation.workflowStatus === 'READY_CLEARANCE' ? 'Ready for Clearance' : 'Completed'}.`
    );
    return evaluation;
}

// ─── Live DHS scraper ─────────────────────────────────────────────────────────

function emptyEvaluation(): ClearanceEvaluation {
    return {
        eligible: false,
        currentCode: null,
        matchedDescription: null,
        statusDate: null,
        daysSinceStatus: null,
        workflowStatus: null,
        notes: [],
        entries: [],
    };
}

/**
 * Read a consumer's status history from DHS and evaluate clearance readiness.
 *
 * Flow mirrors the manual steps:
 *   1. Log in to DHS
 *   2. Open Search & Manage Consumer, enter the RSA ID, Apply Filter
 *   3. Open "View Consumer Status History" for that consumer
 *   4. Parse the popup table and evaluate clearance readiness
 *
 * Read-only: it never changes anything on DHS or in our database.
 */
export async function getConsumerStatusHistory(idNumber: string): Promise<ConsumerStatusHistoryResult> {
    const browserInstance = await getBrowser();
    const page = await browserInstance.newPage();
    let screenshotPath = '';

    try {
        const credentials = await getDHSCredentials();
        logger.info('=== Starting DHS Consumer Status History Check ===');
        logger.info('ID Number:', idNumber);

        const loggedIn = await loginToDHS(page, credentials);
        if (!loggedIn) {
            return { found: false, idNumber, evaluation: emptyEvaluation(), message: 'Failed to login to DHS' };
        }

        logger.info('Navigating to Search & Manage Consumer:', DHS_CONFIG.searchManageConsumerUrl);
        await page.goto(DHS_CONFIG.searchManageConsumerUrl, { waitUntil: 'load', timeout: DHS_CONFIG.timeout });
        await delay(2000);

        const searched = await fillIdAndApplyFilter(page, idNumber);
        if (!searched) {
            screenshotPath = `storage/uploads/dhs-status-history-no-input-${Date.now()}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });
            return {
                found: false,
                idNumber,
                evaluation: emptyEvaluation(),
                message: 'Could not search consumer on DHS (RSA ID input not found)',
                screenshot: screenshotPath,
            };
        }

        // Wait for the filtered results to load.
        await delay(5000);

        const rows = await openAndReadStatusHistory(page, idNumber);

        screenshotPath = `storage/uploads/dhs-status-history-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });

        const entries = parseStatusHistoryRows(rows);
        logger.info(`[DHS StatusHistory] Parsed ${entries.length} status history entr(y/ies)`);

        const evaluation = evaluateConsumerClearance(entries);
        logger.info('[DHS StatusHistory] Evaluation:', JSON.stringify({
            eligible: evaluation.eligible,
            currentCode: evaluation.currentCode,
            daysSinceStatus: evaluation.daysSinceStatus,
            workflowStatus: evaluation.workflowStatus,
        }));

        const message =
            entries.length === 0
                ? 'No status history found for this consumer on DHS.'
                : evaluation.notes[0] ?? 'Status history read.';

        return { found: entries.length > 0, idNumber, evaluation, message, screenshot: screenshotPath };
    } catch (error) {
        logger.error('Error reading DHS consumer status history:', error);
        try {
            screenshotPath = `storage/uploads/dhs-status-history-error-${Date.now()}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });
        } catch {
            // ignore screenshot failure
        }
        return {
            found: false,
            idNumber,
            evaluation: emptyEvaluation(),
            message: `Error: ${error instanceof Error ? error.message : String(error)}`,
            screenshot: screenshotPath,
        };
    } finally {
        await page.close();
    }
}

/** Fill the RSA ID field and click Apply Filter on the Search & Manage Consumer page. */
async function fillIdAndApplyFilter(page: Page, idNumber: string): Promise<boolean> {
    const idSelectors = [
        '#ContentPlaceHolder1_txtRSAIDNo',
        '#ContentPlaceHolder1_txtIdNumber',
        '#ContentPlaceHolder1_txtPassport',
        'input[id*="RSAID"]',
        'input[id*="RSAId"]',
        'input[id*="IdNumber"]',
        'input[id*="IDNumber"]',
        'input[id*="Passport"]',
    ];

    let idSelector: string | null = null;
    for (const selector of idSelectors) {
        if (await page.$(selector)) {
            idSelector = selector;
            break;
        }
    }

    // Fallback: find the text input next to an "RSA ID" label.
    if (!idSelector) {
        idSelector = (await page.evaluate(`(function () {
            var labels = document.querySelectorAll('label, td, span');
            for (var i = 0; i < labels.length; i++) {
                var txt = (labels[i].textContent || '').toLowerCase();
                if (txt.indexOf('rsa id') > -1) {
                    var parent = labels[i].closest('tr, div, td');
                    if (parent) {
                        var input = parent.querySelector('input[type="text"]');
                        if (input && input.id) return '#' + input.id;
                    }
                }
            }
            return null;
        })()`)) as string | null;
    }

    if (!idSelector) {
        logger.warn('[DHS StatusHistory] Could not find RSA ID input field');
        return false;
    }

    logger.info('[DHS StatusHistory] Using ID input selector:', idSelector);
    await page.click(idSelector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(idSelector, idNumber, { delay: 80 });
    await delay(400);

    const applySelectors = [
        '#cp_pagedata_lb_ApplyDataFilter',
        'a[id*="ApplyDataFilter"]',
        'a[id*="ApplyFilter"]',
        'a[id*="lb_Apply"]',
    ];
    let applySelector: string | null = null;
    for (const selector of applySelectors) {
        try {
            if (await page.$(selector)) {
                applySelector = selector;
                break;
            }
        } catch {
            // invalid selector, keep trying
        }
    }
    if (!applySelector) {
        applySelector = (await page.evaluate(`(function () {
            var links = document.querySelectorAll('a.btn, a');
            for (var i = 0; i < links.length; i++) {
                if ((links[i].textContent || '').indexOf('Apply Filter') > -1 && links[i].id) {
                    return '#' + links[i].id;
                }
            }
            return null;
        })()`)) as string | null;
    }

    if (applySelector) {
        logger.info('[DHS StatusHistory] Clicking Apply Filter:', applySelector);
        await page.click(applySelector);
    } else {
        logger.warn('[DHS StatusHistory] Apply Filter button not found — relying on auto-filtered results');
    }

    return true;
}

/**
 * Open the "View Consumer Status History" popup/page for the searched consumer
 * and return its table rows as arrays of cell text.
 */
async function openAndReadStatusHistory(page: Page, idNumber: string): Promise<string[][]> {
    // Strategy 1: many DHS action icons open a sub-page via ShowUserManagementPage('dhs_X.aspx?...').
    const historyUrl = (await page.evaluate(`(function () {
        var els = Array.from(document.querySelectorAll('[onclick]'));
        for (var i = 0; i < els.length; i++) {
            var oc = els[i].getAttribute('onclick') || '';
            if (/statushistory|consumerstatus/i.test(oc)) {
                var m = oc.match(/ShowUserManagementPage\\(['"]([^'"]+)['"]/);
                if (m) return m[1];
            }
        }
        return null;
    })()`)) as string | null;

    if (historyUrl) {
        const fullUrl = historyUrl.startsWith('http')
            ? historyUrl
            : `${DHS_CONFIG.baseUrl}/${historyUrl.replace(/^\//, '')}`;
        logger.info('[DHS StatusHistory] Navigating to status history page:', fullUrl);
        await page.goto(fullUrl, { waitUntil: 'load', timeout: DHS_CONFIG.timeout });
        await delay(1500);
    } else {
        // Strategy 2: click the icon by its tooltip ("View Consumer Status History").
        const clicked = (await page.evaluate(`(function () {
            var els = Array.from(document.querySelectorAll('[title]'));
            for (var i = 0; i < els.length; i++) {
                var t = (els[i].getAttribute('title') || '').toLowerCase();
                if (t.indexOf('status history') > -1) {
                    els[i].click();
                    return true;
                }
            }
            return false;
        })()`)) as boolean;

        if (!clicked) {
            logger.warn('[DHS StatusHistory] Could not find a status history control on the page');
            return [];
        }
    }

    // The history table loads via AJAX into a modal, so poll for it (up to ~15s)
    // rather than reading once — a single read can fire before the popup renders.
    for (let attempt = 0; attempt < 10; attempt++) {
        const rows = await readStatusHistoryTable(page);
        if (rows.length > 0) {
            logger.info(`[DHS StatusHistory] Found status history table on attempt ${attempt + 1}`);
            return rows;
        }
        await delay(1500);
    }

    logger.warn('[DHS StatusHistory] Status history table did not appear within timeout');
    return [];
}

/**
 * Read the status history rows once.
 *
 * DHS renders the popup with the column headers (CODE / STATUS DESCRIPTION /
 * STATUS DATE) separate from the data rows, sometimes inside a modal frame —
 * so matching on header text fails. Instead we harvest, across every frame, any
 * table row that has BOTH a date cell and a long description cell. That pattern
 * uniquely identifies status-history rows and excludes the background results
 * grid (whose rows have a date but only short cells).
 */
async function readStatusHistoryTable(page: Page): Promise<string[][]> {
    const harvest = `(function () {
        var out = [];
        var trs = document.querySelectorAll('tr');
        for (var i = 0; i < trs.length; i++) {
            var cells = trs[i].querySelectorAll('td, th');
            if (!cells.length) continue;
            var rowData = [];
            var hasDate = false;
            var hasLongText = false;
            for (var c = 0; c < cells.length; c++) {
                var t = (cells[c].innerText || cells[c].textContent || '').trim();
                rowData.push(t);
                if (/\\d{4}-\\d{2}-\\d{2}/.test(t)) hasDate = true;
                if (t.length > 30) hasLongText = true;
            }
            if (hasDate && hasLongText) out.push(rowData);
        }
        return out;
    })()`;

    // Search the main document and any sub-frames (the modal may be an iframe).
    for (const frame of page.frames()) {
        try {
            const rows = (await frame.evaluate(harvest)) as string[][] | null;
            if (rows && rows.length > 0) return rows;
        } catch {
            // Frame detached / cross-origin — skip.
        }
    }
    return [];
}
