/**
 * The single gate every mailbox-harvested attachment passes through.
 *
 * Both email scanners (the cron sweep and the per-case manual check) call this
 * instead of writing a Document row directly, so the ownership rule cannot be
 * enforced in one path and silently missed in the other.
 *
 * A MISMATCH is written to the quarantine area, NOT to the case. No Document row
 * is created, so the wrong consumer's file is never associated with this case in
 * the database at all — hiding it in the UI would not be good enough.
 */

import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import crypto from 'crypto';
import { prisma } from '@zenowethu/database';
import { createLogger } from '../logger';
import { verifyDocumentOwnership, type VerifyOwnershipResult } from './verify-ownership';

const logger = createLogger('documents/ingest');

export interface AttachmentSource {
    mailboxId?: string | null;
    messageId?: string | null;
    from?: string | null;
    subject?: string | null;
    date?: Date | null;
}

export type IngestOutcome =
    | { action: 'ATTACHED'; documentId: string; verification: VerifyOwnershipResult; attachmentHash: string }
    | { action: 'QUARANTINED'; quarantineId: string; verification: VerifyOwnershipResult; attachmentHash: string };

export function safeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
}

export function hashBuffer(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** Absolute path of the quarantine area — deliberately outside every case's uploads dir. */
export function quarantineDir(baseDir: string, caseId: string): string {
    return join(baseDir, 'storage', 'quarantine', caseId);
}

export function caseUploadDir(baseDir: string, caseId: string): string {
    return join(baseDir, 'storage', 'uploads', caseId);
}

/**
 * Verify an attachment against the case client, then persist it to the correct
 * place. Returns which branch was taken so callers can report accurate counts.
 */
export async function ingestAttachment({
    baseDir,
    caseId,
    expectedIdNumber,
    expectedFirstName,
    expectedLastName,
    fileName,
    mimeType,
    buffer,
    detectedType,
    uploadedById,
    source,
}: {
    baseDir: string;
    caseId: string;
    expectedIdNumber?: string | null;
    expectedFirstName?: string | null;
    expectedLastName?: string | null;
    fileName: string;
    mimeType: string;
    buffer: Buffer;
    detectedType: string;
    uploadedById: string | null;
    source?: AttachmentSource;
}): Promise<IngestOutcome> {
    const attachmentHash = hashBuffer(buffer);

    const verification = await verifyDocumentOwnership({
        buffer,
        mimeType,
        fileName,
        expectedIdNumber,
        expectedFirstName,
        expectedLastName,
    });

    const uniqueFileName = `${Date.now()}-${safeFileName(fileName)}`;

    if (verification.verdict === 'MISMATCH') {
        const dir = quarantineDir(baseDir, caseId);
        await mkdir(dir, { recursive: true });
        const storagePath = join(dir, uniqueFileName);
        await writeFile(storagePath, buffer);

        const record = await prisma.quarantinedDocument.create({
            data: {
                intendedCaseId: caseId,
                fileName,
                storagePath,
                fileSize: buffer.length,
                mimeType,
                detectedType,
                attachmentHash,
                reason: verification.reason,
                extractedIdNumber: verification.extractedIdNumber,
                expectedIdNumber: verification.expectedIdNumber,
                allExtractedIds: verification.allExtractedIds.join(',') || null,
                sourceMailboxId: source?.mailboxId ?? null,
                sourceMessageId: source?.messageId ?? null,
                sourceFrom: source?.from ?? null,
                sourceSubject: source?.subject ?? null,
                sourceDate: source?.date ?? null,
            },
            select: { id: true },
        });

        logger.warn(
            { caseId, fileName, found: verification.extractedIdNumber, expected: verification.expectedIdNumber },
            'Attachment quarantined — contents belong to a different consumer',
        );

        return { action: 'QUARANTINED', quarantineId: record.id, verification, attachmentHash };
    }

    const dir = caseUploadDir(baseDir, caseId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, uniqueFileName), buffer);

    const document = await prisma.document.create({
        data: {
            caseId,
            type: detectedType,
            fileName,
            fileUrl: `/uploads/${caseId}/${uniqueFileName}`,
            fileSize: buffer.length,
            mimeType,
            uploadedById,
            verificationStatus: verification.verdict,
            extractedIdNumber: verification.extractedIdNumber,
            verifiedAt: new Date(),
            sourceMailboxId: source?.mailboxId ?? null,
            sourceMessageId: source?.messageId ?? null,
        },
        select: { id: true },
    });

    return { action: 'ATTACHED', documentId: document.id, verification, attachmentHash };
}
