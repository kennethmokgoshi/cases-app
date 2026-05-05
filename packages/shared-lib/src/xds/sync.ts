/**
 * XDS Sync — Core Business Logic
 *
 * Behaviour:
 *  - Reads `xds_last_synced_date` from systemSettings to know where to resume.
 *  - First run (no stored date): processes EVERY date found in XDS Search History.
 *  - Subsequent runs: processes every date from (lastSyncedDate + 1 day) up to yesterday.
 *  - After each date succeeds, updates `xds_last_synced_date` immediately so a crash
 *    mid-run still saves partial progress.
 *  - Cases auto-created from XDS are tagged:
 *      acquisitionType = "Credit Bureaus XDS April 2026"  (dynamic month/year)
 */

import { logger } from '../logger';
import { XdsCreditReportEntry, XdsSyncResult, XdsSyncDetail } from './types';
import { getXdsBrowser, getXdsCredentials, loginToXds, closeXdsBrowser } from './browser';
import { getXdsHistoryGroupedByDate, downloadPdfsForEntries } from './scraper';

// ─── Month names for acquisitionType label ─────────────────────────────────────

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

function xdsAcquisitionLabel(dateStr: string): string {
    // dateStr = YYYY-MM-DD
    const [year, month] = dateStr.split('-').map(Number);
    const monthName = MONTH_NAMES[(month ?? 1) - 1] ?? 'Unknown';
    return `Credit Bureaus XDS ${monthName} ${year}`;
}

// ─── Last-synced-date tracking ────────────────────────────────────────────────

async function getLastSyncedDate(): Promise<string | null> {
    const { prisma } = require('@zenowethu/database');
    const setting = await prisma.systemSettings.findUnique({
        where: { key: 'xds_last_synced_date' },
        select: { value: true },
    });
    return setting?.value || null; // YYYY-MM-DD or null
}

async function saveLastSyncedDate(dateKey: string): Promise<void> {
    const { prisma } = require('@zenowethu/database');
    await prisma.systemSettings.upsert({
        where: { key: 'xds_last_synced_date' },
        update: { value: dateKey, updatedAt: new Date() },
        create: {
            key: 'xds_last_synced_date',
            value: dateKey,
            category: 'xds',
            description: 'Last calendar date fully processed by XDS sync (YYYY-MM-DD)',
            isEncrypted: false,
        },
    });
    logger.info(`[XDS] Last synced date saved: ${dateKey}`);
}

// ─── File Number Generation ────────────────────────────────────────────────────

async function generateFileNumber(): Promise<string> {
    const { prisma } = require('@zenowethu/database');
    const year = new Date().getFullYear();
    const prefix = `ZDM-${year}-`;

    const lastCase = await prisma.case.findFirst({
        where: { fileNumber: { startsWith: prefix } },
        orderBy: { fileNumber: 'desc' },
        select: { fileNumber: true },
    });

    let nextNumber = 1;
    if (lastCase) {
        const parts = lastCase.fileNumber.split('-');
        const last = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(last)) nextNumber = last + 1;
    }

    return `${prefix}${String(nextNumber).padStart(3, '0')}`;
}

// ─── Admin Notification ────────────────────────────────────────────────────────

async function notifyAdminsNewFile(params: {
    consumerFirstName: string;
    consumerLastName: string;
    idNumber: string | null;
    fileNumber: string;
    caseId: string;
}): Promise<void> {
    const { prisma } = require('@zenowethu/database');
    const { consumerFirstName, consumerLastName, idNumber, fileNumber, caseId } = params;
    const consumerName = `${consumerFirstName} ${consumerLastName}`;

    const admins = await prisma.user.findMany({
        where: { isAdmin: true },
        select: { id: true, email: true, firstName: true, emailNotificationsEnabled: true },
    });

    if (admins.length === 0) {
        logger.warn('[XDS] No admin users found to notify');
        return;
    }

    await Promise.all(
        admins.map((admin: { id: string }) =>
            prisma.inAppNotification.create({
                data: {
                    userId: admin.id,
                    type: 'NEW_FILE',
                    title: `XDS: New File Created — ${consumerName}`,
                    message: `A new case file (${fileNumber}) was automatically created from an XDS credit report. Consumer: ${consumerName}${idNumber ? ` (ID: ${idNumber})` : ''}.`,
                    caseId,
                    linkUrl: `/cases/${caseId}`,
                },
            })
        )
    );

    logger.info(`[XDS] In-app notifications sent to ${admins.length} admin(s) for ${fileNumber}`);

    const emailAdmins = admins.filter((a: { emailNotificationsEnabled: boolean; email: string | null }) => a.emailNotificationsEnabled && a.email);
    if (emailAdmins.length === 0) return;

    try {
        const { SmtpEmailProvider } = await import('../notifications/providers');
        if (!process.env.SMTP_HOST) {
            logger.warn('[XDS] SMTP not configured — skipping email notifications');
            return;
        }

        const emailProvider = new SmtpEmailProvider({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER || '',
                pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '',
            },
            fromEmail: process.env.EMAIL_FROM || process.env.SMTP_FROM,
        });

        const appUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
        const caseUrl = `${appUrl}/cases/${caseId}`;

        for (const admin of emailAdmins) {
            await emailProvider.send(
                admin.email!,
                `XDS Alert: New File Created — ${consumerName} (${fileNumber})`,
                `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                    <h2 style="color:#1a56db">New Case File Created from XDS Credit Report</h2>
                    <p>Hello ${admin.firstName},</p>
                    <p>The automated XDS sync created a new case file from a credit report.</p>
                    <table style="border-collapse:collapse;width:100%;margin:16px 0">
                        <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb">Consumer</td><td style="padding:8px;border:1px solid #e5e7eb">${consumerName}</td></tr>
                        ${idNumber ? `<tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb">ID Number</td><td style="padding:8px;border:1px solid #e5e7eb">${idNumber}</td></tr>` : ''}
                        <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb">File Number</td><td style="padding:8px;border:1px solid #e5e7eb">${fileNumber}</td></tr>
                    </table>
                    <a href="${caseUrl}" style="display:inline-block;padding:10px 20px;background:#1a56db;color:white;text-decoration:none;border-radius:6px">View Case File</a>
                </div>`,
                `New Case File\nConsumer: ${consumerName}${idNumber ? `\nID: ${idNumber}` : ''}\nFile: ${fileNumber}\n${caseUrl}`
            );
        }
        logger.info(`[XDS] Email sent to ${emailAdmins.length} admin(s)`);
    } catch (emailError) {
        logger.error('[XDS] Email notification failed:', emailError);
    }
}

// ─── PDF Storage ──────────────────────────────────────────────────────────────

async function savePdfToDisk(
    caseId: string,
    fileName: string,
    buffer: Buffer
): Promise<{ fileUrl: string }> {
    const { writeFile, mkdir } = require('fs/promises');
    const { join } = require('path');
    const { existsSync } = require('fs');

    const uploadsDir = existsSync('/storage')
        ? join('/storage', 'uploads', caseId)
        : join('storage', 'uploads', caseId);

    if (!existsSync(uploadsDir)) {
        await mkdir(uploadsDir, { recursive: true });
    }

    const safeFileName = `${Date.now()}-${fileName}`;
    await writeFile(join(uploadsDir, safeFileName), buffer);
    return { fileUrl: `/uploads/${caseId}/${safeFileName}` };
}

// ─── Upload to Existing Case ──────────────────────────────────────────────────

async function uploadToCaseFile(caseId: string, entry: XdsCreditReportEntry): Promise<void> {
    const { prisma } = require('@zenowethu/database');
    const { fileUrl } = await savePdfToDisk(caseId, entry.fileName, entry.pdfBuffer);

    await prisma.document.create({
        data: {
            caseId,
            type: 'CREDIT_REPORT',
            fileName: entry.fileName,
            fileUrl,
            fileSize: entry.pdfBuffer.length,
            mimeType: 'application/pdf',
        },
    });

    logger.info(`[XDS] Uploaded credit report to case ${caseId}`);
}

// ─── Create New Case File ─────────────────────────────────────────────────────

async function createNewCaseFile(
    entry: XdsCreditReportEntry,
    dateKey: string
): Promise<{ caseId: string; fileNumber: string }> {
    const { prisma } = require('@zenowethu/database');
    const nameParts = entry.consumerName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Unknown';
    const lastName = nameParts.slice(1).join(' ') || 'Consumer';
    const idNumber = entry.idNumber || `XDS-${Date.now()}`;

    // Dynamic label e.g. "Credit Bureaus XDS April 2026"
    const acquisitionType = xdsAcquisitionLabel(dateKey);

    let fileNumber = await generateFileNumber();
    let newCase: { id: string; fileNumber: string } | null = null;
    let attempts = 0;

    while (attempts < 5) {
        try {
            newCase = await prisma.$transaction(async (tx: any) => {
                let client = await tx.client.findUnique({ where: { idNumber } });

                if (!client) {
                    client = await tx.client.create({
                        data: { firstName, lastName, idNumber },
                    });
                    logger.info(`[XDS] Created client: ${client.id} (${firstName} ${lastName})`);
                }

                const createdCase = await tx.case.create({
                    data: {
                        fileNumber,
                        clientId: client.id,
                        status: 'XDS_LEAD',
                        acquisitionType, // "Credit Bureaus XDS April 2026"
                    },
                });

                logger.info(`[XDS] Created case: ${createdCase.id} (${fileNumber}) — ${acquisitionType}`);
                return createdCase;
            });
            break;
        } catch (err: any) {
            if (err?.code === 'P2002' && err?.meta?.target?.includes('fileNumber')) {
                attempts++;
                fileNumber = await generateFileNumber();
                logger.warn(`[XDS] File number collision, retrying with ${fileNumber}`);
            } else {
                throw err;
            }
        }
    }

    if (!newCase) throw new Error(`[XDS] Failed to create case after ${attempts} attempts`);

    await uploadToCaseFile(newCase.id, entry);
    return { caseId: newCase.id, fileNumber: newCase.fileNumber };
}

// ─── Process One Date ─────────────────────────────────────────────────────────

async function processDateEntries(
    entries: XdsCreditReportEntry[],
    dateKey: string,
    result: XdsSyncResult
): Promise<void> {
    const { prisma } = require('@zenowethu/database');

    for (const entry of entries) {
        result.processed++;
        const detail: XdsSyncDetail = {
            consumerName: entry.consumerName,
            idNumber: entry.idNumber,
            action: 'skipped',
            caseId: null,
            fileNumber: null,
            message: '',
            date: dateKey,
        };

        try {
            let existingCase: { id: string; fileNumber: string } | null = null;

            if (entry.idNumber) {
                const client = await prisma.client.findUnique({
                    where: { idNumber: entry.idNumber },
                    include: {
                        cases: {
                            orderBy: { createdAt: 'desc' },
                            take: 1,
                            select: { id: true, fileNumber: true },
                        },
                    },
                });
                if (client?.cases?.length) existingCase = client.cases[0];
            }

            if (existingCase) {
                await uploadToCaseFile(existingCase.id, entry);
                detail.action = 'uploaded';
                detail.caseId = existingCase.id;
                detail.fileNumber = existingCase.fileNumber;
                detail.message = `Uploaded to existing case ${existingCase.fileNumber}`;
                result.existingFilesUpdated++;
                logger.info(`[XDS] Uploaded to ${existingCase.fileNumber} (${entry.consumerName})`);
            } else {
                const { caseId, fileNumber } = await createNewCaseFile(entry, dateKey);
                const nameParts = entry.consumerName.trim().split(/\s+/);
                await notifyAdminsNewFile({
                    consumerFirstName: nameParts[0] || 'Unknown',
                    consumerLastName: nameParts.slice(1).join(' ') || 'Consumer',
                    idNumber: entry.idNumber,
                    fileNumber,
                    caseId,
                });
                detail.action = 'created';
                detail.caseId = caseId;
                detail.fileNumber = fileNumber;
                detail.message = `New case ${fileNumber} created for ${entry.consumerName}`;
                result.newFilesCreated++;
                logger.info(`[XDS] Created ${fileNumber} for ${entry.consumerName}`);
            }
        } catch (entryError) {
            const msg = entryError instanceof Error ? entryError.message : String(entryError);
            logger.error(`[XDS] Error processing ${entry.consumerName}:`, entryError);
            detail.action = 'error';
            detail.message = msg;
            result.errors.push(`${entry.consumerName} (${dateKey}): ${msg}`);
        }

        result.details.push(detail);
    }
}

// ─── Main Sync Orchestrator ───────────────────────────────────────────────────

/**
 * Run the XDS sync.
 *
 * Date logic:
 *  - Reads `xds_last_synced_date` from DB.
 *  - If no stored date → processes EVERY date found in XDS history.
 *  - If stored date exists → processes every date from (stored + 1 day) up to yesterday.
 *  - After each date completes → immediately saves it as the new last synced date.
 *  - If a date has no entries in XDS history → still marks it as processed (no gaps).
 */
export async function runXdsSync(mode: 'daily' | 'today' | 'full' = 'daily'): Promise<XdsSyncResult> {
    const result: XdsSyncResult = {
        processed: 0,
        newFilesCreated: 0,
        existingFilesUpdated: 0,
        errors: [],
        details: [],
        datesProcessed: [],
        lastSyncedDate: null,
    };

    let browser: Awaited<ReturnType<typeof getXdsBrowser>> | null = null;
    let page: import('puppeteer').Page | null = null;

    try {
        const credentials = await getXdsCredentials();

        if (!credentials.username || !credentials.password) {
            throw new Error('XDS credentials not configured. Go to Admin → Settings → XDS Credit Bureau.');
        }

        // ── 1. Determine which dates to process ─────────────────────────────
        const lastSyncedDate = await getLastSyncedDate(); // YYYY-MM-DD or null
        logger.info(`[XDS] Last synced date: ${lastSyncedDate ?? 'never — first run'}`);

        // Yesterday = the most recent complete day (today may still have new reports coming in)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = yesterday.toISOString().split('T')[0];

        // ── 2. Log in and scrape all available history ───────────────────────
        browser = await getXdsBrowser();
        page = await browser.newPage();
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        const loggedIn = await loginToXds(page, credentials);
        if (!loggedIn) {
            throw new Error('Failed to log in to XDS portal. Check your credentials in Admin → Settings → XDS Credit Bureau.');
        }

        const historyByDate = await getXdsHistoryGroupedByDate(page, credentials);

        if (historyByDate.size === 0) {
            logger.info('[XDS] No history entries found on the portal');
            return result;
        }

        // ── 3. Build the ordered list of dates to process ────────────────────
        // All dates from XDS history, oldest first
        const availableDates = [...historyByDate.keys()].sort();
        const todayKey = new Date().toISOString().split('T')[0];

        let datesToProcess: string[];

        if (mode === 'today') {
            // Process ONLY today
            datesToProcess = [todayKey].filter(d => availableDates.includes(d));
            logger.info(`[XDS] Mode: TODAY — processing ${datesToProcess.length} date(s)`);
        } else if (mode === 'full') {
            // Process everything available in history
            datesToProcess = availableDates;
            logger.info(`[XDS] Mode: FULL — processing all ${datesToProcess.length} available date(s)`);
        } else {
            // Default: Daily (resume from last synced)
            if (!lastSyncedDate) {
                // First run — process everything available in history
                datesToProcess = availableDates;
                logger.info(`[XDS] Mode: DAILY (First Run) — processing all ${datesToProcess.length} available date(s)`);
            } else {
                // Resume from day after last synced, up to and including yesterday
                datesToProcess = availableDates.filter(d => d > lastSyncedDate && d <= yesterdayKey);
                logger.info(
                    `[XDS] Mode: DAILY — resuming from ${lastSyncedDate} up to ${yesterdayKey} (${datesToProcess.length} date(s))`
                );
            }
        }

        if (datesToProcess.length === 0) {
            logger.info(`[XDS] No dates to process for mode: ${mode}`);
            result.lastSyncedDate = lastSyncedDate;
            return result;
        }

        // ── 4. Process each date in order ────────────────────────────────────
        for (const dateKey of datesToProcess) {
            logger.info(`[XDS] ── Processing date: ${dateKey} ──`);

            const historyEntries = historyByDate.get(dateKey) || [];

            if (historyEntries.length === 0) {
                // Date is in the range but no entries — mark as done and move on
                logger.info(`[XDS] No entries for ${dateKey} — marking as processed`);
                await saveLastSyncedDate(dateKey);
                result.datesProcessed.push(dateKey);
                result.lastSyncedDate = dateKey;
                continue;
            }

            logger.info(`[XDS] ${historyEntries.length} entries for ${dateKey}`);

            // Download PDFs for this date's entries
            const reports = await downloadPdfsForEntries(page, historyEntries, credentials.portalUrl);

            if (reports.length === 0) {
                logger.warn(`[XDS] No PDFs downloaded for ${dateKey} — check view links`);
            }

            // Process each report
            await processDateEntries(reports, dateKey, result);

            // Save progress immediately after each date succeeds
            await saveLastSyncedDate(dateKey);
            result.datesProcessed.push(dateKey);
            result.lastSyncedDate = dateKey;

            logger.info(`[XDS] Date ${dateKey} complete — progress saved`);
        }

        logger.info(
            `[XDS] Sync finished — ${result.processed} reports, ${result.newFilesCreated} new cases, ` +
            `${result.existingFilesUpdated} updated, ${result.errors.length} errors, ` +
            `dates: ${result.datesProcessed.join(', ')}`
        );
    } catch (fatalError) {
        const msg = fatalError instanceof Error ? fatalError.message : String(fatalError);
        logger.error('[XDS] Fatal sync error:', fatalError);
        result.errors.push(`Fatal: ${msg}`);
    } finally {
        if (page) await page.close().catch(() => null);
        await closeXdsBrowser();
    }

    return result;
}
