/**
 * NCR Public Register — Debt Counsellor Lookup
 *
 * When DHS is offline and no email is stored in our database, we fall back
 * to the NCR's public debt counsellor register at ncr.org.za to retrieve
 * the DC's contact email using their NCRDC registration number.
 *
 * URL: https://www.ncr.org.za/index.php/registered-dcs (public search, no login required)
 */

import { logger } from '../logger';

export interface NCRDCLookupResult {
    found: boolean;
    email?: string;
    fullName?: string;
    tradingName?: string;
    tel?: string;
    mobile?: string;
    source: 'ncr_website' | 'not_found' | 'error';
    error?: string;
}

/**
 * Look up a debt counsellor on the NCR public register by their NCRDC number.
 * Returns their email address and basic contact info if found.
 */
export async function lookupDCFromNCR(ncrdcNo: string): Promise<NCRDCLookupResult> {
    if (!ncrdcNo?.trim()) {
        return { found: false, source: 'not_found', error: 'No NCRDC number provided' };
    }

    const cleanNcrdc = ncrdcNo.trim().toUpperCase();
    logger.info(`Looking up DC on NCR website: ${cleanNcrdc}`);

    try {
        // NCR public register search URL — NCRDC number as query param
        const searchUrl = `https://www.ncr.org.za/index.php/registered-dcs?search=${encodeURIComponent(cleanNcrdc)}`;

        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml',
            },
            signal: AbortSignal.timeout(15000)
        });

        if (!response.ok) {
            logger.warn(`NCR website returned ${response.status} for NCRDC ${cleanNcrdc}`);
            return { found: false, source: 'error', error: `NCR website returned status ${response.status}` };
        }

        const html = await response.text();

        // Extract email — look for the NCRDC row and pull the email field
        const email = extractEmailFromNCRPage(html, cleanNcrdc);

        if (!email) {
            logger.info(`No email found on NCR website for NCRDC ${cleanNcrdc}`);
            return { found: false, source: 'not_found' };
        }

        logger.info(`Found email on NCR website for ${cleanNcrdc}: ${email}`);
        return {
            found: true,
            email,
            source: 'ncr_website'
        };

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`NCR website lookup failed for ${cleanNcrdc}:`, message);
        return { found: false, source: 'error', error: message };
    }
}

/**
 * Extract email from NCR HTML response.
 * The NCR register page uses a table with columns including the NCRDC No and Email.
 * This parser looks for the row containing the NCRDC number and extracts the email.
 */
function extractEmailFromNCRPage(html: string, ncrdcNo: string): string | null {
    // Find the row that contains this NCRDC number
    const rowPattern = new RegExp(
        `<tr[^>]*>[\\s\\S]*?${escapeRegex(ncrdcNo)}[\\s\\S]*?</tr>`,
        'i'
    );
    const rowMatch = html.match(rowPattern);
    if (!rowMatch) return null;

    const row = rowMatch[0];

    // Extract email from the row — standard email pattern
    const emailMatch = row.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) return emailMatch[0].toLowerCase();

    // Also look for mailto: links
    const mailtoMatch = row.match(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
    if (mailtoMatch) return mailtoMatch[1].toLowerCase();

    return null;
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve the best available DC email address using a priority chain:
 *
 *   1. caseData.dcEmail        — current email stored on this case
 *   2. caseData.lastKnownEmail — last email that worked for this case
 *   3. Database lookup          — most recent non-bad email for this NCRDC across all cases
 *   4. NCR website scrape       — public register lookup by NCRDC number
 *
 * Bad emails (previously flagged as bounced) are excluded from steps 3 & 4 via
 * the badEmails exclusion list stored in SystemSettings.
 */
export interface DCEmailResolution {
    email: string | null;
    source: 'case_record' | 'last_known' | 'database_history' | 'ncr_website' | 'not_found';
    ncrWebsiteLookupAttempted: boolean;
}

export async function resolveDCEmail(
    caseData: {
        dcEmail?: string | null;
        lastKnownEmail?: string | null;
        ncrdcNo?: string | null;
    },
    badEmails: string[] = []
): Promise<DCEmailResolution> {
    const isGoodEmail = (email: string | null | undefined): email is string =>
        !!email && email.trim().length > 0 && !badEmails.includes(email.toLowerCase().trim());

    // 1. Current case email
    if (isGoodEmail(caseData.dcEmail)) {
        return { email: caseData.dcEmail, source: 'case_record', ncrWebsiteLookupAttempted: false };
    }

    // 2. Last known email on this case
    if (isGoodEmail(caseData.lastKnownEmail)) {
        return { email: caseData.lastKnownEmail, source: 'last_known', ncrWebsiteLookupAttempted: false };
    }

    // 3 & 4 require NCRDC number
    if (!caseData.ncrdcNo) {
        return { email: null, source: 'not_found', ncrWebsiteLookupAttempted: false };
    }

    // 3. Database history — handled by caller (needs prisma, kept out of shared-lib)
    //    Caller should pass in any DB-found email as caseData.dcEmail or lastKnownEmail.

    // 4. NCR website fallback
    logger.info(`No DB email found — trying NCR website for NCRDC ${caseData.ncrdcNo}`);
    const ncrResult = await lookupDCFromNCR(caseData.ncrdcNo);

    if (ncrResult.found && ncrResult.email && !badEmails.includes(ncrResult.email.toLowerCase())) {
        return { email: ncrResult.email, source: 'ncr_website', ncrWebsiteLookupAttempted: true };
    }

    return { email: null, source: 'not_found', ncrWebsiteLookupAttempted: true };
}
