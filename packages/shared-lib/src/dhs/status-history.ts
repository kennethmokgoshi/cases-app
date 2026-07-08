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
export const DHS_UNSUSPEND_CONSUMER_SERVICES_REASON = 'The consumer wants to resume with the program';
const DHS_UNSUSPEND_CONFIRMATION_WAIT_MS = 30000;

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

/** Services-suspension state read off the Search & Manage Consumer grid. */
export type SuspensionStatus = 'SUSPENDED' | 'NOT_SUSPENDED' | 'UNKNOWN';

/**
 * The services-suspension indicator for a consumer row on the DHS Search &
 * Manage Consumer page. Business rule (per operations): the FAR-RIGHT action
 * button on the consumer's row is the source of truth —
 *   • RED   → services are NOT suspended
 *   • GREEN → services ARE suspended
 * The SUSP IND grid column (Y/N) is captured as a secondary signal and used
 * only when the button colour cannot be determined.
 */
export interface SuspensionIndicator {
    status: SuspensionStatus;
    /** Which signal decided the status, e.g. "far-right action button is red". */
    signal: string | null;
    /** Colour classified from the far-right action button: 'red' | 'green' | null. */
    buttonColor: 'red' | 'green' | null;
    /** Raw class attribute of the far-right action button, for transparency. */
    buttonClass: string | null;
    /** Tooltip/title of the far-right action button, if any. */
    buttonTitle: string | null;
    /** Raw value of the SUSP IND column cell (usually "Y"/"N"), if found. */
    suspIndCell: string | null;
    notes: string[];
}

/** Raw signals harvested from the consumer's grid row (input to the classifier). */
export interface SuspensionRowSignals {
    /** class attribute of the far-right action button in the row's ACTION cell. */
    buttonClass?: string | null;
    /** Computed background-color of that button, e.g. "rgb(217, 83, 79)". */
    buttonBgColor?: string | null;
    /** title attribute of that button. */
    buttonTitle?: string | null;
    /** Text of the SUSP IND column cell for the row, if the header was found. */
    suspIndCell?: string | null;
}

/** Result of a live DHS consumer status-history check. */
export interface ConsumerStatusHistoryResult {
    found: boolean;
    idNumber: string;
    evaluation: ClearanceEvaluation;
    /** Services-suspension indicator from the consumer's grid row (null if the row was not read). */
    suspension: SuspensionIndicator | null;
    /** Raw cells of the consumer's grid row (surname, names, status, DC, ...), for reporting. */
    rowCells: string[] | null;
    message: string;
    screenshot?: string;
}

/** Result of reading only the Search & Manage Consumer suspension indicator. */
export interface ConsumerSuspensionCheckResult {
    found: boolean;
    idNumber: string;
    suspension: SuspensionIndicator | null;
    rowCells: string[] | null;
    message: string;
    screenshot?: string;
}

/** Result of clicking the DHS "Unsuspend Consumer Services" toggle. */
export interface UnsuspendConsumerServicesResult {
    success: boolean;
    idNumber: string;
    unsuspended: boolean;
    before: SuspensionIndicator | null;
    after: SuspensionIndicator | null;
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

/**
 * Classify a colour from a button's class attribute and/or computed background.
 * DHS uses Bootstrap-style button classes (btn-danger = red, btn-success = green);
 * the RGB fallback handles inline-styled buttons.
 */
export function classifyButtonColor(
    buttonClass?: string | null,
    buttonBgColor?: string | null
): 'red' | 'green' | null {
    const cls = (buttonClass ?? '').toLowerCase();
    if (/\b(btn-danger|red)\b/.test(cls)) return 'red';
    if (/\b(btn-success|green)\b/.test(cls)) return 'green';

    const m = (buttonBgColor ?? '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) {
        const r = Number(m[1]);
        const g = Number(m[2]);
        const b = Number(m[3]);
        if (r > g + 40 && r > b + 40) return 'red';
        if (g > r + 40 && g > b + 40) return 'green';
    }
    return null;
}

/**
 * Classify a consumer's services-suspension state from the raw row signals.
 *
 * Business rule: the far-right action button decides —
 *   RED → NOT suspended, GREEN → suspended.
 * When the button colour cannot be determined, the SUSP IND column (Y/N) is
 * used as a fallback; otherwise UNKNOWN.
 */
export function classifySuspension(signals: SuspensionRowSignals): SuspensionIndicator {
    const notes: string[] = [];
    const buttonColor = classifyButtonColor(signals.buttonClass, signals.buttonBgColor);
    const suspIndCell = (signals.suspIndCell ?? '').trim() || null;

    const indicator: SuspensionIndicator = {
        status: 'UNKNOWN',
        signal: null,
        buttonColor,
        buttonClass: signals.buttonClass ?? null,
        buttonTitle: signals.buttonTitle ?? null,
        suspIndCell,
        notes,
    };

    if (buttonColor === 'red') {
        indicator.status = 'NOT_SUSPENDED';
        indicator.signal = 'far-right action button is red';
        notes.push('Far-right action button on the consumer row is RED → services are NOT suspended.');
        return indicator;
    }
    if (buttonColor === 'green') {
        indicator.status = 'SUSPENDED';
        indicator.signal = 'far-right action button is green';
        notes.push('Far-right action button on the consumer row is GREEN → services ARE suspended.');
        return indicator;
    }

    // Secondary signal: the toggle's tooltip states the ACTION it offers —
    // "Unsuspend Consumer Services" means services are currently suspended.
    const title = (signals.buttonTitle ?? '').toLowerCase();
    if (title.includes('unsuspend')) {
        indicator.status = 'SUSPENDED';
        indicator.signal = `button tooltip is "${signals.buttonTitle}" (colour unreadable)`;
        notes.push('Suspend-services button offers "Unsuspend" → services ARE suspended.');
        return indicator;
    }
    if (title.includes('suspend')) {
        indicator.status = 'NOT_SUSPENDED';
        indicator.signal = `button tooltip is "${signals.buttonTitle}" (colour unreadable)`;
        notes.push('Suspend-services button offers "Suspend" → services are NOT suspended.');
        return indicator;
    }

    const suspInd = (suspIndCell ?? '').toUpperCase();
    if (suspInd === 'Y' || suspInd === 'N') {
        indicator.status = suspInd === 'Y' ? 'SUSPENDED' : 'NOT_SUSPENDED';
        indicator.signal = `SUSP IND column is "${suspInd}" (button colour unreadable)`;
        notes.push(
            `Far-right action button colour could not be determined — fell back to the SUSP IND column ("${suspInd}").`
        );
        return indicator;
    }

    notes.push('Neither the far-right action button colour nor the SUSP IND column could be read — suspension state unknown.');
    return indicator;
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
            return { found: false, idNumber, evaluation: emptyEvaluation(), suspension: null, rowCells: null, message: 'Failed to login to DHS' };
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
                suspension: null,
                rowCells: null,
                message: 'Could not search consumer on DHS (RSA ID input not found)',
                screenshot: screenshotPath,
            };
        }

        // Wait for the filtered results to load.
        await delay(5000);

        // Read the consumer's grid row FIRST (services-suspension indicator +
        // row cells) — opening the status-history popup can obscure the grid.
        const rowRead = await readConsumerRow(page, idNumber);
        const suspension = rowRead ? classifySuspension(rowRead.signals) : null;
        const rowCells = rowRead?.cells ?? null;
        if (suspension) {
            logger.info(`[DHS StatusHistory] Suspension indicator: ${suspension.status} (${suspension.signal ?? 'no signal'})`);
        } else {
            logger.warn('[DHS StatusHistory] Consumer grid row not found — suspension state not read');
        }

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

        return { found: entries.length > 0, idNumber, evaluation, suspension, rowCells, message, screenshot: screenshotPath };
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
            suspension: null,
            rowCells: null,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`,
            screenshot: screenshotPath,
        };
    } finally {
        await page.close();
    }
}

/**
 * Read the services-suspension state before any clearance/document work runs.
 * This is intentionally narrower than getConsumerStatusHistory(): it stops after
 * the Search & Manage Consumer grid row is read.
 */
export async function getConsumerSuspensionIndicator(idNumber: string): Promise<ConsumerSuspensionCheckResult> {
    const browserInstance = await getBrowser();
    const page = await browserInstance.newPage();
    let screenshotPath = '';

    try {
        const prepared = await openSearchManageConsumer(page, idNumber);
        if (prepared.ok === false) {
            return {
                found: false,
                idNumber,
                suspension: null,
                rowCells: null,
                message: prepared.message,
                screenshot: prepared.screenshot,
            };
        }

        const rowRead = await readConsumerRow(page, idNumber);
        screenshotPath = `storage/uploads/dhs-suspension-check-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });

        if (!rowRead) {
            return {
                found: false,
                idNumber,
                suspension: null,
                rowCells: null,
                message: 'Consumer row not found on DHS Search & Manage Consumer.',
                screenshot: screenshotPath,
            };
        }

        const suspension = classifySuspension(rowRead.signals);
        return {
            found: true,
            idNumber,
            suspension,
            rowCells: rowRead.cells,
            message: suspension.status === 'UNKNOWN'
                ? 'DHS consumer row found, but services-suspension state could not be determined.'
                : `DHS services are ${suspension.status === 'SUSPENDED' ? 'SUSPENDED' : 'NOT suspended'}.`,
            screenshot: screenshotPath,
        };
    } catch (error) {
        logger.error('Error reading DHS consumer suspension indicator:', error);
        try {
            screenshotPath = `storage/uploads/dhs-suspension-check-error-${Date.now()}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });
        } catch {
            // ignore screenshot failure
        }
        return {
            found: false,
            idNumber,
            suspension: null,
            rowCells: null,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`,
            screenshot: screenshotPath,
        };
    } finally {
        await page.close();
    }
}

/**
 * Click DHS' "Unsuspend Consumer Services" action when the row is definitely
 * suspended. It refuses to click when the state is unknown or already active.
 */
export async function unsuspendConsumerServices(idNumber: string): Promise<UnsuspendConsumerServicesResult> {
    const browserInstance = await getBrowser();
    const page = await browserInstance.newPage();
    let screenshotPath = '';

    try {
        page.on('dialog', async (dialog) => {
            await dialog.accept().catch(() => null);
        });

        const prepared = await openSearchManageConsumer(page, idNumber);
        if (prepared.ok === false) {
            return {
                success: false,
                idNumber,
                unsuspended: false,
                before: null,
                after: null,
                message: prepared.message,
                screenshot: prepared.screenshot,
            };
        }

        const beforeRead = await readConsumerRow(page, idNumber);
        const before = beforeRead ? classifySuspension(beforeRead.signals) : null;
        if (!beforeRead || !before) {
            screenshotPath = `storage/uploads/dhs-unsuspend-no-row-${Date.now()}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });
            return {
                success: false,
                idNumber,
                unsuspended: false,
                before,
                after: null,
                message: 'Consumer row not found on DHS Search & Manage Consumer.',
                screenshot: screenshotPath,
            };
        }

        if (before.status === 'NOT_SUSPENDED') {
            return {
                success: true,
                idNumber,
                unsuspended: false,
                before,
                after: before,
                message: 'Consumer services are already not suspended.',
            };
        }

        if (before.status !== 'SUSPENDED') {
            return {
                success: false,
                idNumber,
                unsuspended: false,
                before,
                after: null,
                message: 'DHS suspension state is unknown, so the unsuspend button was not clicked.',
            };
        }

        const clicked = await clickSuspensionToggle(page, idNumber);
        if (!clicked) {
            screenshotPath = `storage/uploads/dhs-unsuspend-no-button-${Date.now()}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });
            return {
                success: false,
                idNumber,
                unsuspended: false,
                before,
                after: null,
                message: 'Could not find the DHS Unsuspend Consumer Services button.',
                screenshot: screenshotPath,
            };
        }

        const completed = await completeUnsuspendDialog(page, DHS_UNSUSPEND_CONSUMER_SERVICES_REASON);
        if (!completed) {
            screenshotPath = `storage/uploads/dhs-unsuspend-dialog-incomplete-${Date.now()}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });
            return {
                success: false,
                idNumber,
                unsuspended: false,
                before,
                after: null,
                message: 'DHS opened the unsuspend dialog, but the required reason, final Unsuspend button, or Continue step could not be completed.',
                screenshot: screenshotPath,
            };
        }

        await delay(DHS_UNSUSPEND_CONFIRMATION_WAIT_MS);
        await refreshSearchManageConsumerResult(page, idNumber);
        const afterRead = await readConsumerRow(page, idNumber);
        const after = afterRead ? classifySuspension(afterRead.signals) : null;
        screenshotPath = `storage/uploads/dhs-unsuspend-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });

        const unsuspended = after?.status === 'NOT_SUSPENDED';
        return {
            success: unsuspended,
            idNumber,
            unsuspended,
            before,
            after,
            message: unsuspended
                ? 'DHS consumer services were unsuspended successfully.'
                : 'DHS unsuspend was clicked, but the consumer still appears suspended. Please verify manually.',
            screenshot: screenshotPath,
        };
    } catch (error) {
        logger.error('Error unsuspending DHS consumer services:', error);
        try {
            screenshotPath = `storage/uploads/dhs-unsuspend-error-${Date.now()}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });
        } catch {
            // ignore screenshot failure
        }
        return {
            success: false,
            idNumber,
            unsuspended: false,
            before: null,
            after: null,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`,
            screenshot: screenshotPath,
        };
    } finally {
        await page.close();
    }
}

async function openSearchManageConsumer(
    page: Page,
    idNumber: string
): Promise<{ ok: true } | { ok: false; message: string; screenshot?: string }> {
    const credentials = await getDHSCredentials();
    logger.info('=== Starting DHS Search & Manage Consumer Suspension Check ===');
    logger.info('ID Number:', idNumber);

    const loggedIn = await loginToDHS(page, credentials);
    if (!loggedIn) {
        return { ok: false, message: 'Failed to login to DHS' };
    }

    logger.info('Navigating to Search & Manage Consumer:', DHS_CONFIG.searchManageConsumerUrl);
    await page.goto(DHS_CONFIG.searchManageConsumerUrl, { waitUntil: 'load', timeout: DHS_CONFIG.timeout });
    await delay(2000);

    const searched = await fillIdAndApplyFilter(page, idNumber);
    if (!searched) {
        const screenshot = `storage/uploads/dhs-suspension-no-input-${Date.now()}.png`;
        await page.screenshot({ path: screenshot, fullPage: true });
        return { ok: false, message: 'Could not search consumer on DHS (RSA ID input not found)', screenshot };
    }

    await delay(5000);
    return { ok: true };
}

/**
 * Find the consumer's row on the Search & Manage Consumer results grid and
 * harvest (a) all its cell texts and (b) the far-right action button's class,
 * computed background colour and title — the services-suspension signals.
 *
 * The ACTION cell is the row's first cell; its LAST button/link is the
 * suspension toggle. The SUSP IND column is located via the header row when
 * present. Searches every frame (the grid may render inside one).
 */
async function readConsumerRow(
    page: Page,
    idNumber: string
): Promise<{ cells: string[]; signals: SuspensionRowSignals } | null> {
    const harvest = `(function () {
        var target = ${JSON.stringify(idNumber)};
        var clean = function (s) { return (s || '').replace(/\\s+/g, ' ').trim(); };

        // Find the INNERMOST row whose own (direct) cells contain the ID as a
        // whole cell value. Outer layout rows also contain the ID in their text,
        // so among matches keep the one with the least total text.
        var best = null;
        var trs = document.querySelectorAll('tr');
        for (var i = 0; i < trs.length; i++) {
            var tds = trs[i].querySelectorAll(':scope > td');
            if (!tds.length) continue;
            var cells = [];
            var hit = false;
            for (var c = 0; c < tds.length; c++) {
                var t = clean(tds[c].innerText);
                cells.push(t);
                if (t.replace(/\\s/g, '') === target) hit = true;
            }
            if (!hit) continue;
            var len = (trs[i].innerText || '').length;
            if (!best || len < best.len) best = { tr: trs[i], tds: tds, cells: cells, len: len };
        }
        if (!best) return null;

        // SUSP IND cell: try the header row of the row's own table first, then
        // fall back to the known grid layout (ID → +7: SURNAME, NAME(S), GENDER,
        // RACE, STATUS, TRNS IND, SUSP IND).
        var suspCell = null;
        var table = best.tr.closest('table');
        if (table) {
            var headRows = table.querySelectorAll('tr');
            for (var hr = 0; hr < headRows.length; hr++) {
                var hcs = headRows[hr].querySelectorAll(':scope > th, :scope > td');
                var headerTexts = [];
                var suspCol = -1;
                for (var h = 0; h < hcs.length; h++) {
                    var ht = clean(hcs[h].innerText).toUpperCase();
                    headerTexts.push(ht);
                    if (ht.indexOf('SUSP') > -1 && ht.length < 20) suspCol = h;
                }
                if (suspCol > -1 && suspCol < best.cells.length) {
                    suspCell = best.cells[suspCol];
                    break;
                }
            }
        }
        if (suspCell === null || suspCell.length > 3) {
            var idIdx = -1;
            for (var k = 0; k < best.cells.length; k++) {
                if (best.cells[k].replace(/\\s/g, '') === target) { idIdx = k; break; }
            }
            if (idIdx > -1 && idIdx + 7 < best.cells.length) {
                var candidate = best.cells[idIdx + 7].toUpperCase();
                suspCell = candidate === 'Y' || candidate === 'N' ? candidate : suspCell;
            }
        }

        // The services-suspension toggle is the far-right button of the ACTION
        // cell. DHS renders it as <div id="btnSuspendServices_<ncrRef>"
        // class="btn btn-danger|btn-success btn-xs" title="(Un)suspend Consumer
        // Services"> — target it by id first, then fall back to the last
        // button-like element in the ACTION cell / row.
        var btn = best.tr.querySelector('[id^="btnSuspendServices"]');
        if (!btn) {
            var scope = best.tds[0].querySelectorAll('a, button, div[class*="btn"], input[type="button"], input[type="submit"], span[onclick], i[onclick]');
            if (!scope.length) {
                scope = best.tr.querySelectorAll('a, button, div[class*="btn"], input[type="button"], input[type="submit"]');
            }
            if (scope.length) btn = scope[scope.length - 1];
        }
        var btnClass = null, btnBg = null, btnTitle = null;
        if (btn) {
            btnClass = btn.getAttribute('class');
            btnTitle = btn.getAttribute('title') || btn.getAttribute('data-original-title');
            try { btnBg = window.getComputedStyle(btn).backgroundColor; } catch (e) {}
        }
        return {
            cells: best.cells,
            signals: {
                buttonClass: btnClass,
                buttonBgColor: btnBg,
                buttonTitle: btnTitle,
                suspIndCell: suspCell
            }
        };
    })()`;

    for (const frame of page.frames()) {
        try {
            const found = (await frame.evaluate(harvest)) as
                | { cells: string[]; signals: SuspensionRowSignals }
                | null;
            if (found) return found;
        } catch {
            // Frame detached / cross-origin - skip.
        }
    }
    return null;
}

async function clickSuspensionToggle(page: Page, idNumber: string): Promise<boolean> {
    const clickScript = `(function () {
        var target = ${JSON.stringify(idNumber)};
        var clean = function (s) { return (s || '').replace(/\\s+/g, ' ').trim(); };
        var best = null;
        var trs = document.querySelectorAll('tr');
        for (var i = 0; i < trs.length; i++) {
            var tds = trs[i].querySelectorAll(':scope > td');
            if (!tds.length) continue;
            var hit = false;
            for (var c = 0; c < tds.length; c++) {
                if (clean(tds[c].innerText).replace(/\\s/g, '') === target) hit = true;
            }
            if (!hit) continue;
            var len = (trs[i].innerText || '').length;
            if (!best || len < best.len) best = { tr: trs[i], tds: tds, len: len };
        }
        if (!best) return false;
        var btn = best.tr.querySelector('[id^="btnSuspendServices"]');
        if (!btn) {
            var scope = best.tds[0].querySelectorAll('a, button, div[class*="btn"], input[type="button"], input[type="submit"], span[onclick], i[onclick]');
            if (!scope.length) {
                scope = best.tr.querySelectorAll('a, button, div[class*="btn"], input[type="button"], input[type="submit"]');
            }
            if (scope.length) btn = scope[scope.length - 1];
        }
        if (!btn) return false;
        btn.click();
        return true;
    })()`;

    for (const frame of page.frames()) {
        try {
            const clicked = (await frame.evaluate(clickScript)) as boolean;
            if (clicked) return true;
        } catch {
            // Frame detached / cross-origin - skip.
        }
    }
    return false;
}

async function completeUnsuspendDialog(page: Page, reason: string): Promise<boolean> {
    await delay(1000);

    let reasonEntered = false;
    for (let attempt = 0; attempt < 10; attempt++) {
        reasonEntered = await fillUnsuspendReason(page, reason);
        if (reasonEntered) break;
        await delay(1000);
    }
    if (!reasonEntered) return false;

    let submitted = false;
    for (let attempt = 0; attempt < 5; attempt++) {
        submitted = await clickUnsuspendDialogSubmit(page);
        if (submitted) break;
        await delay(1000);
    }
    if (!submitted) return false;

    return clickUnsuspendContinue(page);
}

async function fillUnsuspendReason(page: Page, reason: string): Promise<boolean> {
    const fillScript = `(function () {
        var reason = ${JSON.stringify(reason)};
        var clean = function (s) { return (s || '').replace(/\\s+/g, ' ').trim(); };
        var isVisible = function (el) {
            if (!el) return false;
            var rect = el.getBoundingClientRect();
            var style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        };
        var textareas = document.querySelectorAll('textarea');
        for (var i = 0; i < textareas.length; i++) {
            var textarea = textareas[i];
            var context = clean(document.body.innerText).toLowerCase();
            if (!isVisible(textarea)) continue;
            if (context.indexOf('unsuspend consumer debt counsellor services reason') === -1 && context.indexOf('unsuspend consumer') === -1) continue;
            textarea.focus();
            textarea.value = reason;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }
        return false;
    })()`;

    for (const frame of page.frames()) {
        try {
            const filled = (await frame.evaluate(fillScript)) as boolean;
            if (filled) return true;
        } catch {
            // Frame detached / cross-origin - skip.
        }
    }
    return false;
}

async function clickUnsuspendDialogSubmit(page: Page): Promise<boolean> {
    const submitScript = `(function () {
        var clean = function (s) { return (s || '').replace(/\\s+/g, ' ').trim(); };
        var isVisible = function (el) {
            if (!el) return false;
            var rect = el.getBoundingClientRect();
            var style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        };
        var candidates = document.querySelectorAll('button, input[type="button"], input[type="submit"], a, div[class*="btn"], span[onclick]');
        for (var i = 0; i < candidates.length; i++) {
            var el = candidates[i];
            if (!isVisible(el)) continue;
            var text = clean(el.innerText || el.value || el.getAttribute('title') || el.getAttribute('aria-label')).toLowerCase();
            if (text.indexOf('unsuspend consumer debt counsellor services') === -1) continue;
            var context = clean(document.body.innerText).toLowerCase();
            if (context.indexOf('unsuspend consumer debt counsellor services reason') === -1) continue;
            el.click();
            return true;
        }
        return false;
    })()`;

    for (const frame of page.frames()) {
        try {
            const clicked = (await frame.evaluate(submitScript)) as boolean;
            if (clicked) return true;
        } catch {
            // Frame detached / cross-origin — skip.
        }
    }
    return false;
}

async function clickUnsuspendContinue(page: Page): Promise<boolean> {
    const continueScript = `(function () {
        var clean = function (s) { return (s || '').replace(/\\s+/g, ' ').trim(); };
        var isVisible = function (el) {
            if (!el) return false;
            var rect = el.getBoundingClientRect();
            var style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        };
        var candidates = document.querySelectorAll('button, input[type="button"], input[type="submit"], a, div[class*="btn"], span[onclick]');
        for (var i = 0; i < candidates.length; i++) {
            var el = candidates[i];
            if (!isVisible(el)) continue;
            var text = clean(el.innerText || el.value || el.getAttribute('title') || el.getAttribute('aria-label')).toLowerCase();
            if (text.indexOf('continue') === -1) continue;
            el.click();
            return true;
        }
        return false;
    })()`;

    for (let attempt = 0; attempt < 10; attempt++) {
        for (const frame of page.frames()) {
            try {
                const clicked = (await frame.evaluate(continueScript)) as boolean;
                if (clicked) return true;
            } catch {
                // Frame detached / cross-origin - skip.
            }
        }
        await delay(1000);
    }
    return false;
}

async function refreshSearchManageConsumerResult(page: Page, idNumber: string): Promise<void> {
    await page.reload({ waitUntil: 'load', timeout: DHS_CONFIG.timeout });
    await delay(2000);
    await fillIdAndApplyFilter(page, idNumber);
    await delay(5000);
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
