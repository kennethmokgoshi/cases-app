/**
 * XDS Sync — Core Business Logic
 *
 * For each downloaded credit report:
 *  1. Extract consumer ID number (from PDF text or AI analysis)
 *  2. Look up existing Client/Case by ID number
 *  3a. If case exists → upload credit report to existing case
 *  3b. If case does not exist → create Client + Case, upload credit report,
 *       notify all admins (in-app + email) that a new file was created
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { prisma } from '@zenowethu/database';
import { logger } from '../logger';
import { XdsCreditReportEntry, XdsSyncResult, XdsSyncDetail } from './types';
import { getXdsBrowser, getXdsCredentials, loginToXds, closeXdsBrowser } from './browser';
import { scrapeXdsSearchHistory } from './scraper';

// ─── File Number Generation ────────────────────────────────────────────────────

async function generateFileNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `ZDM-${year}-`;

    // Find the highest existing file number for this year
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
    const { consumerFirstName, consumerLastName, idNumber, fileNumber, caseId } = params;
    const consumerName = `${consumerFirstName} ${consumerLastName}`;

    // Find all admin users with email notifications enabled
    const admins = await prisma.user.findMany({
        where: { isAdmin: true },
        select: { id: true, email: true, firstName: true, emailNotificationsEnabled: true },
    });

    if (admins.length === 0) {
        logger.warn('[XDS] No admin users found to notify');
        return;
    }

    // Create in-app notifications for all admins
    await Promise.all(
        admins.map(admin =>
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

    logger.info(`[XDS] In-app notifications sent to ${admins.length} admin(s) for new file ${fileNumber}`);

    // Send email to admins who have email notifications enabled
    const emailAdmins = admins.filter(a => a.emailNotificationsEnabled && a.email);
    if (emailAdmins.length === 0) return;

    try {
        // Import lazily to avoid circular deps
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
                `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #1a56db;">New Case File Created from XDS Credit Report</h2>
                        <p>Hello ${admin.firstName},</p>
                        <p>The automated XDS sync has created a new case file based on a credit report pulled from the XDS portal.</p>
                        <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold; background: #f9fafb;">Consumer Name</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">${consumerName}</td>
                            </tr>
                            ${idNumber ? `
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold; background: #f9fafb;">ID Number</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">${idNumber}</td>
                            </tr>` : ''}
                            <tr>
                                <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold; background: #f9fafb;">File Number</td>
                                <td style="padding: 8px; border: 1px solid #e5e7eb;">${fileNumber}</td>
                            </tr>
                        </table>
                        <a href="${caseUrl}" style="display: inline-block; padding: 10px 20px; background: #1a56db; color: white; text-decoration: none; border-radius: 6px; margin-top: 8px;">
                            View Case File
                        </a>
                        <p style="margin-top: 24px; color: #6b7280; font-size: 13px;">
                            This notification was generated automatically by the XDS daily sync.
                        </p>
                    </div>
                `,
                `New Case File Created\n\nConsumer: ${consumerName}${idNumber ? `\nID: ${idNumber}` : ''}\nFile Number: ${fileNumber}\nView: ${caseUrl}`
            );
        }

        logger.info(`[XDS] Email notifications sent to ${emailAdmins.length} admin(s)`);
    } catch (emailError) {
        logger.error('[XDS] Failed to send email notifications:', emailError);
        // Non-fatal — in-app notifications already sent
    }
}

// ─── Save PDF to Disk ─────────────────────────────────────────────────────────

async function savePdfToDisk(
    caseId: string,
    fileName: string,
    buffer: Buffer
): Promise<{ filePath: string; fileUrl: string }> {
    // Determine storage root — same convention as the upload route
    // In production the app's CWD is /app (inside Docker), storage mounts at /storage
    const storageDirs = [
        join('/storage', 'uploads', caseId),
        join(process.cwd(), 'storage', 'uploads', caseId),
    ];

    let uploadsDir = storageDirs[1]; // default
    // Use /storage if it exists (Docker production)
    if (existsSync('/storage')) {
        uploadsDir = storageDirs[0];
    }

    if (!existsSync(uploadsDir)) {
        await mkdir(uploadsDir, { recursive: true });
    }

    const timestamp = Date.now();
    const safeFileName = `${timestamp}-${fileName}`;
    const filePath = join(uploadsDir, safeFileName);
    const fileUrl = `/uploads/${caseId}/${safeFileName}`;

    await writeFile(filePath, buffer);
    return { filePath, fileUrl };
}

// ─── Upload Credit Report to an Existing Case ─────────────────────────────────

async function uploadToCaseFile(
    caseId: string,
    entry: XdsCreditReportEntry
): Promise<void> {
    const { filePath: _fp, fileUrl } = await savePdfToDisk(caseId, entry.fileName, entry.pdfBuffer);

    await prisma.document.create({
        data: {
            caseId,
            type: 'CREDIT_REPORT',
            fileName: entry.fileName,
            fileUrl,
            fileSize: entry.pdfBuffer.length,
            mimeType: 'application/pdf',
            // No uploadedById — system-generated
        },
    });

    logger.info(`[XDS] Credit report uploaded to case ${caseId}: ${entry.fileName}`);
}

// ─── Create a New Case File ───────────────────────────────────────────────────

async function createNewCaseFile(
    entry: XdsCreditReportEntry
): Promise<{ caseId: string; fileNumber: string }> {
    // Parse first/last name from the consumer name (best-effort)
    const nameParts = entry.consumerName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Unknown';
    const lastName = nameParts.slice(1).join(' ') || 'Consumer';

    const idNumber = entry.idNumber || `XDS-${Date.now()}`; // fallback if no ID extracted

    // Generate unique file number with retry logic
    let fileNumber = await generateFileNumber();
    let newCase: { id: string; fileNumber: string } | null = null;
    let attempts = 0;

    while (attempts < 5) {
        try {
            newCase = await prisma.$transaction(async (tx) => {
                // Create or find client by ID number
                let client = await tx.client.findUnique({ where: { idNumber } });

                if (!client) {
                    client = await tx.client.create({
                        data: {
                            firstName,
                            lastName,
                            idNumber,
                        },
                    });
                    logger.info(`[XDS] Created new client: ${client.id} (${firstName} ${lastName})`);
                }

                // Create the case
                const createdCase = await tx.case.create({
                    data: {
                        fileNumber,
                        clientId: client.id,
                        status: 'NEW_LEAD',
                        acquisitionType: 'B2C',
                    },
                });

                logger.info(`[XDS] Created new case: ${createdCase.id} (${fileNumber})`);
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

    if (!newCase) {
        throw new Error(`[XDS] Failed to create case after ${attempts} attempts`);
    }

    // Upload the credit report to the new case
    await uploadToCaseFile(newCase.id, entry);

    return { caseId: newCase.id, fileNumber: newCase.fileNumber };
}

// ─── Main Sync Orchestrator ───────────────────────────────────────────────────

export async function runXdsSync(options?: { targetDate?: Date }): Promise<XdsSyncResult> {
    const result: XdsSyncResult = {
        processed: 0,
        newFilesCreated: 0,
        existingFilesUpdated: 0,
        errors: [],
        details: [],
    };

    let browser: Awaited<ReturnType<typeof getXdsBrowser>> | null = null;
    let page: import('puppeteer').Page | null = null;

    try {
        const credentials = await getXdsCredentials();

        if (!credentials.username || !credentials.password) {
            throw new Error('XDS credentials not configured. Please set them in Admin → Settings → XDS.');
        }

        browser = await getXdsBrowser();
        page = await browser.newPage();

        // Set a realistic user agent to avoid bot detection
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        const loggedIn = await loginToXds(page, credentials);
        if (!loggedIn) {
            throw new Error('Failed to log in to XDS portal. Check your credentials.');
        }

        // Scrape today's credit reports
        const reports = await scrapeXdsSearchHistory(page, credentials, options?.targetDate);

        if (reports.length === 0) {
            logger.info('[XDS] No reports found for today');
            return result;
        }

        // Process each report
        for (const entry of reports) {
            result.processed++;
            const detail: XdsSyncDetail = {
                consumerName: entry.consumerName,
                idNumber: entry.idNumber,
                action: 'skipped',
                caseId: null,
                fileNumber: null,
                message: '',
            };

            try {
                // Look up existing case by client ID number
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
                    if (client && client.cases.length > 0) {
                        existingCase = client.cases[0];
                    }
                }

                if (existingCase) {
                    // ─── Case exists: upload credit report to it ───────────────
                    await uploadToCaseFile(existingCase.id, entry);

                    detail.action = 'uploaded';
                    detail.caseId = existingCase.id;
                    detail.fileNumber = existingCase.fileNumber;
                    detail.message = `Credit report uploaded to existing case ${existingCase.fileNumber}`;
                    result.existingFilesUpdated++;

                    logger.info(`[XDS] Uploaded to existing case: ${existingCase.fileNumber} (${entry.consumerName})`);
                } else {
                    // ─── No case: create new file and notify admins ────────────
                    const { caseId, fileNumber } = await createNewCaseFile(entry);

                    // Get the client name from the created case for notification
                    const nameParts = entry.consumerName.trim().split(/\s+/);
                    const firstName = nameParts[0] || 'Unknown';
                    const lastName = nameParts.slice(1).join(' ') || 'Consumer';

                    await notifyAdminsNewFile({
                        consumerFirstName: firstName,
                        consumerLastName: lastName,
                        idNumber: entry.idNumber,
                        fileNumber,
                        caseId,
                    });

                    detail.action = 'created';
                    detail.caseId = caseId;
                    detail.fileNumber = fileNumber;
                    detail.message = `New case file ${fileNumber} created for ${entry.consumerName}`;
                    result.newFilesCreated++;

                    logger.info(`[XDS] Created new file: ${fileNumber} for ${entry.consumerName}`);
                }
            } catch (entryError) {
                const msg = entryError instanceof Error ? entryError.message : String(entryError);
                logger.error(`[XDS] Error processing ${entry.consumerName}:`, entryError);
                detail.action = 'error';
                detail.message = msg;
                result.errors.push(`${entry.consumerName}: ${msg}`);
            }

            result.details.push(detail);
        }

        logger.info(`[XDS] Sync complete — ${result.processed} processed, ${result.newFilesCreated} new, ${result.existingFilesUpdated} updated, ${result.errors.length} errors`);
    } catch (fatalError) {
        const msg = fatalError instanceof Error ? fatalError.message : String(fatalError);
        logger.error('[XDS] Fatal sync error:', fatalError);
        result.errors.push(`Fatal: ${msg}`);
    } finally {
        if (page) await page.close().catch(() => null);
        // Close browser when done to free resources
        await closeXdsBrowser();
    }

    return result;
}
