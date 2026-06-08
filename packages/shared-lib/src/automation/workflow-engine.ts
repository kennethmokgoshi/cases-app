/**
 * Workflow Automation Engine — Shared Helpers
 *
 * Used by /api/cron/workflow-automation to process overdue cases
 * across all 15 workflow statuses.
 */

import { prisma } from '@zenowethu/database';
import { logger } from '../logger';
import { addWorkingDays } from '../statuses/workingDays';
import { sendManualMessage } from '../notifications/service';
import { GhlService } from '../integrations/ghl-service';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OverdueCase {
    id: string;
    fileNumber: string;
    status: string;
    nextUpdate: Date | null;
    dcEmail: string | null;
    dcTradingName: string | null;
    debtCounsellorName: string | null;
    ncrdcNo: string | null;
    acquisitionType: string | null;
    client: {
        id: string;
        firstName: string;
        lastName: string;
        idNumber: string;
        email: string | null;
        phone: string | null;
        whatsappNumber: string | null;
    };
    documents: Array<{ type: string; fileName: string; fileUrl: string; uploadedAt: Date }>;
}

// ─── Query Helpers ────────────────────────────────────────────────────────────

/**
 * Get ALL cases in a given workflow status, regardless of nextUpdate.
 * Use for statuses that should be retried on every cron run until resolved.
 */
export async function getAllCasesByStatus(status: string, take = 200): Promise<OverdueCase[]> {
    return prisma.case.findMany({
        where: { status, deletedAt: null },
        include: {
            client: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    idNumber: true,
                    email: true,
                    phone: true,
                    whatsappNumber: true,
                },
            },
            documents: {
                select: { type: true, fileName: true, fileUrl: true, uploadedAt: true },
            },
        },
        orderBy: { createdAt: 'asc' },
        take,
    }) as unknown as OverdueCase[];
}

/**
 * Get all overdue cases in a given workflow status.
 * Overdue = nextUpdate is in the past OR null.
 */
export async function getOverdueCases(status: string, take = 50): Promise<OverdueCase[]> {
    const now = new Date();
    return prisma.case.findMany({
        where: {
            status,
            deletedAt: null,
            OR: [{ nextUpdate: { lt: now } }, { nextUpdate: null }],
        },
        include: {
            client: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    idNumber: true,
                    email: true,
                    phone: true,
                    whatsappNumber: true,
                },
            },
            documents: {
                select: { type: true, fileName: true, fileUrl: true, uploadedAt: true },
            },
        },
        orderBy: { nextUpdate: 'asc' },
        take,
    }) as unknown as OverdueCase[];
}

/**
 * Get all overdue Letsatsi COMPLETED cases (for Friday report).
 */
export async function getOverdueLetsatsiCompleted(): Promise<OverdueCase[]> {
    const now = new Date();
    return prisma.case.findMany({
        where: {
            status: 'COMPLETED',
            deletedAt: null,
            acquisitionType: 'B2B',
            OR: [{ nextUpdate: { lt: now } }, { nextUpdate: null }],
            projects: {
                some: {
                    project: { name: { contains: 'Letsatsi' } },
                },
            },
        },
        include: {
            client: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    idNumber: true,
                    email: true,
                    phone: true,
                    whatsappNumber: true,
                },
            },
            documents: {
                select: { type: true, fileName: true, fileUrl: true, uploadedAt: true },
            },
        },
        orderBy: { nextUpdate: 'asc' },
        take: 200,
    }) as unknown as OverdueCase[];
}

// ─── Document Checks ─────────────────────────────────────────────────────────

/**
 * Check if the case has at least one document matching any of the given types.
 * Also checks filename for keyword matches (for Form 17.7, proof of payment, etc.)
 */
export function hasDocument(c: OverdueCase, types: string[], filenameKeywords?: string[]): boolean {
    const byType = c.documents.some(d => types.includes(d.type));
    if (byType) return true;
    if (filenameKeywords && filenameKeywords.length > 0) {
        return c.documents.some(d => {
            const name = d.fileName.toLowerCase();
            return filenameKeywords.some(kw => name.includes(kw.toLowerCase()));
        });
    }
    return false;
}

/**
 * Check if any inbound messages on the case mention given keywords.
 * Searches the [Inbound ...] system comments.
 */
export async function hasInboundKeyword(caseId: string, keywords: string[]): Promise<boolean> {
    const comments = await prisma.caseComment.findMany({
        where: {
            caseId,
            content: { contains: '[Inbound' },
        },
        select: { content: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
    });
    return comments.some(c =>
        keywords.some(kw => c.content.toLowerCase().includes(kw.toLowerCase()))
    );
}

/**
 * Check if a document of given types was received AFTER a given date.
 */
export function hasDocumentSince(c: OverdueCase, types: string[], since: Date, filenameKeywords?: string[]): boolean {
    return c.documents.some(d => {
        const typeMatch = types.includes(d.type) ||
            (filenameKeywords?.some(kw => d.fileName.toLowerCase().includes(kw.toLowerCase())) ?? false);
        return typeMatch && d.uploadedAt > since;
    });
}

// ─── Case Updates ─────────────────────────────────────────────────────────────

/**
 * Update a case status and set nextUpdate to +3 working days.
 */
export async function updateCaseStatus(
    caseId: string,
    newStatus: string,
    adminUserId?: string
): Promise<void> {
    await prisma.case.update({
        where: { id: caseId },
        data: {
            status: newStatus,
            nextUpdate: addWorkingDays(new Date(), 3),
            ...(adminUserId ? { updatedById: adminUserId } : {}),
        },
    });
}

/**
 * Only advance nextUpdate to +3 working days, no status change.
 */
export async function setNextUpdate(caseId: string, workingDays = 3, adminUserId?: string): Promise<void> {
    await prisma.case.update({
        where: { id: caseId },
        data: {
            nextUpdate: addWorkingDays(new Date(), workingDays),
            ...(adminUserId ? { updatedById: adminUserId } : {}),
        },
    });
}

/**
 * Add a [SYSTEM] comment to the case timeline.
 */
export async function addSystemComment(caseId: string, content: string, adminUserId?: string): Promise<void> {
    if (!adminUserId) return;
    await prisma.caseComment.create({
        data: {
            caseId,
            userId: adminUserId,
            content: `[SYSTEM] ${content}`,
        },
    });
}

// ─── Notification Helpers ────────────────────────────────────────────────────

/**
 * Send a message to the consumer (WhatsApp preferred, then SMS, then email).
 */
export async function sendConsumerMessage(
    caseId: string,
    c: OverdueCase,
    message: string,
    subject?: string
): Promise<boolean> {
    try {
        if (c.client.whatsappNumber) {
            await GhlService.sendMessage(caseId, 'WHATSAPP', message, subject);
            return true;
        } else if (c.client.phone) {
            await GhlService.sendMessage(caseId, 'SMS', message, subject);
            return true;
        } else if (c.client.email) {
            await sendManualMessage(caseId, 'EMAIL', c.client.email, message, subject || 'Update on your file');
            return true;
        }
        return false;
    } catch (err) {
        logger.error(`[WorkflowEngine] sendConsumerMessage failed for ${caseId}:`, err);
        return false;
    }
}

/**
 * Send an email to the Debt Counsellor on the case.
 */
export async function sendDCEmail(
    caseId: string,
    c: OverdueCase,
    subject: string,
    body: string
): Promise<boolean> {
    const dcEmail = c.dcEmail;
    if (!dcEmail) {
        logger.warn(`[WorkflowEngine] No DC email for case ${c.fileNumber} — skipping DC email`);
        return false;
    }
    try {
        await sendManualMessage(caseId, 'EMAIL', dcEmail, body, subject);
        return true;
    } catch (err) {
        logger.error(`[WorkflowEngine] sendDCEmail failed for ${caseId}:`, err);
        return false;
    }
}

/**
 * Send in-app notification + email to all managers of a case.
 */
export async function notifyManagers(
    caseId: string,
    title: string,
    message: string,
    linkUrl?: string
): Promise<void> {
    try {
        const managers = await prisma.user.findMany({
            where: {
                OR: [
                    { casesAssigned: { some: { id: caseId } } },
                    { isAdmin: true },
                ],
            },
            select: { id: true, email: true },
            take: 10,
        });

        for (const mgr of managers) {
            await prisma.inAppNotification.create({
                data: {
                    userId: mgr.id,
                    type: 'SYSTEM_ALERT',
                    title,
                    message,
                    caseId,
                    linkUrl: linkUrl ?? `/cases/${caseId}`,
                },
            });
        }
    } catch (err) {
        logger.error(`[WorkflowEngine] notifyManagers failed for ${caseId}:`, err);
    }
}

// ─── Document Path Helpers ───────────────────────────────────────────────────

import { join } from 'path';
import { existsSync } from 'fs';

export function resolveDocPath(fileUrl: string): string {
    if (fileUrl.startsWith('/uploads/')) {
        return join(process.cwd(), 'storage', 'uploads', fileUrl.replace('/uploads/', ''));
    }
    return join(process.cwd(), 'public', fileUrl.startsWith('/') ? fileUrl.substring(1) : fileUrl);
}

/**
 * Check if a case has both ID and POA documents with resolvable file paths.
 */
export function getDHSDocuments(c: OverdueCase): { idPath: string | null; poaPath: string | null } {
    const idDoc = c.documents.find(d => d.type === 'ID');
    const poaDoc = c.documents.find(d => d.type === 'POA' || d.type === 'ZENOWETHU_POA');

    const idPath = idDoc ? resolveDocPath(idDoc.fileUrl) : null;
    const poaPath = poaDoc ? resolveDocPath(poaDoc.fileUrl) : null;

    return {
        idPath: idPath && existsSync(idPath) ? idPath : null,
        poaPath: poaPath && existsSync(poaPath) ? poaPath : null,
    };
}

/**
 * Return the public-facing URLs for ID and POA documents (used for email attachments).
 */
export function getDHSDocumentUrls(
    c: OverdueCase,
    appUrl: string
): { idUrl: string | null; poaUrl: string | null; idFileName: string | null; poaFileName: string | null } {
    const idDoc = c.documents.find(d => d.type === 'ID');
    const poaDoc = c.documents.find(d => d.type === 'POA' || d.type === 'ZENOWETHU_POA');

    const toAbsolute = (fileUrl: string) =>
        fileUrl.startsWith('http') ? fileUrl : `${appUrl.replace(/\/$/, '')}${fileUrl}`;

    return {
        idUrl:       idDoc  ? toAbsolute(idDoc.fileUrl)  : null,
        poaUrl:      poaDoc ? toAbsolute(poaDoc.fileUrl) : null,
        idFileName:  idDoc  ? idDoc.fileName             : null,
        poaFileName: poaDoc ? poaDoc.fileName            : null,
    };
}

/**
 * Returns true if a DHS transfer request has already been attempted for this case
 * (detected by the presence of an [AUTO] system comment mentioning a DHS request).
 * Used to suppress the initial DC email on retries.
 */
export async function hasPriorDHSAttempt(caseId: string): Promise<boolean> {
    const comment = await prisma.caseComment.findFirst({
        where: {
            caseId,
            content: { contains: '[AUTO] Not Requested via DHS:' },
        },
        select: { id: true },
    });
    return !!comment;
}
