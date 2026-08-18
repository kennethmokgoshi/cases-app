/**
 * Act on a quarantined document — POST /api/documents/quarantine/[id]
 *
 * REASSIGN — route the file to the case it actually belongs to. The target case's
 *            client ID is re-checked against the IDs read out of the file, so this
 *            action cannot itself create a second mis-file. A staff member may
 *            override that check, but only explicitly and with a reason recorded.
 * DISCARD  — mark the file as not needed. The record and the file on disk are
 *            retained for audit; only the status changes.
 */

import { NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { safeFileName, caseUploadDir } from '@zenowethu/shared-lib/src/documents/ingest';

const logger = createLogger('api/documents/quarantine/[id]');

const BodySchema = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('REASSIGN'),
        caseId: z.string().trim().min(1),
        notes: z.string().trim().max(2000).optional(),
        /** Required when the target client's ID is not present in the file. */
        force: z.boolean().default(false),
    }),
    z.object({
        action: z.literal('DISCARD'),
        notes: z.string().trim().min(1).max(2000),
    }),
]);

function normaliseId(value: string | null | undefined): string {
    return (value ?? '').replace(/\D/g, '');
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const session = await auth();
        const user = session?.user;
        if (!user?.id || !(user.isAdmin || user.isExecutive || user.isSeniorManager)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const parsed = BodySchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request', details: parsed.error.flatten() },
                { status: 400 },
            );
        }
        const body = parsed.data;

        const record = await prisma.quarantinedDocument.findUnique({ where: { id } });
        if (!record) {
            return NextResponse.json({ error: 'Quarantined document not found' }, { status: 404 });
        }
        if (record.status !== 'PENDING_REVIEW') {
            return NextResponse.json(
                { error: `This document has already been actioned (${record.status}).` },
                { status: 409 },
            );
        }

        if (body.action === 'DISCARD') {
            await prisma.quarantinedDocument.update({
                where: { id },
                data: {
                    status: 'DISCARDED',
                    reviewedById: user.id,
                    reviewedAt: new Date(),
                    reviewNotes: body.notes,
                },
            });
            logger.info({ id, userId: user.id }, 'Quarantined document discarded');
            return NextResponse.json({ success: true, action: 'DISCARDED' });
        }

        // ── REASSIGN ──────────────────────────────────────────────────────────
        const targetCase = await prisma.case.findUnique({
            where: { id: body.caseId },
            select: {
                id: true,
                fileNumber: true,
                status: true,
                client: { select: { firstName: true, lastName: true, idNumber: true } },
            },
        });
        if (!targetCase) {
            return NextResponse.json({ error: 'Target case not found' }, { status: 404 });
        }
        if (targetCase.id === record.intendedCaseId) {
            return NextResponse.json(
                { error: 'This document does not belong to the case it was blocked on. Choose a different case.' },
                { status: 400 },
            );
        }

        // Re-check ownership against the TARGET case before attaching anything.
        const extractedIds = (record.allExtractedIds ?? '')
            .split(',')
            .map(normaliseId)
            .filter(Boolean);
        const targetId = normaliseId(targetCase.client.idNumber);
        const targetIdPresent = Boolean(targetId) && extractedIds.includes(targetId);

        if (!targetIdPresent && !body.force) {
            return NextResponse.json(
                {
                    error: 'OWNERSHIP_NOT_CONFIRMED',
                    message:
                        `This file contains ID number(s) ${extractedIds.join(', ') || '(none readable)'}, ` +
                        `but case ${targetCase.fileNumber} belongs to ${targetId || '(no ID on file)'}. ` +
                        'Confirm you have checked the document before overriding.',
                    requiresForce: true,
                },
                { status: 409 },
            );
        }
        if (!targetIdPresent && !body.notes) {
            return NextResponse.json(
                { error: 'A reason is required when overriding the ownership check.' },
                { status: 400 },
            );
        }

        const buffer = await readFile(record.storagePath);
        const dir = caseUploadDir(process.cwd(), targetCase.id);
        await mkdir(dir, { recursive: true });
        const uniqueFileName = `${Date.now()}-${safeFileName(record.fileName)}`;
        await writeFile(join(dir, uniqueFileName), buffer);

        const document = await prisma.document.create({
            data: {
                caseId: targetCase.id,
                type: record.detectedType,
                fileName: record.fileName,
                fileUrl: `/uploads/${targetCase.id}/${uniqueFileName}`,
                fileSize: record.fileSize,
                mimeType: record.mimeType,
                uploadedById: user.id,
                verificationStatus: targetIdPresent ? 'VERIFIED' : 'UNVERIFIED',
                extractedIdNumber: targetIdPresent ? targetId : record.extractedIdNumber,
                verifiedAt: new Date(),
                sourceMailboxId: record.sourceMailboxId,
                sourceMessageId: record.sourceMessageId,
            },
            select: { id: true },
        });

        const note = targetIdPresent
            ? `📄 Document "${record.fileName}" was reassigned here from quarantine by ${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() +
              `. It arrived on another case's email but its contents carry this client's ID number (${targetId}).`
            : `⚠️ Document "${record.fileName}" was manually reassigned here from quarantine by ${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() +
              `, overriding the ownership check. Reason: ${body.notes}`;

        await Promise.all([
            prisma.quarantinedDocument.update({
                where: { id },
                data: {
                    status: 'REASSIGNED',
                    reassignedToCaseId: targetCase.id,
                    reviewedById: user.id,
                    reviewedAt: new Date(),
                    reviewNotes: body.notes ?? null,
                },
            }),
            prisma.caseComment.create({
                data: {
                    caseId: targetCase.id,
                    userId: user.id,
                    content: note,
                    type: 'NOTE',
                    isInternal: true,
                    activityType: 'QUARANTINED_DOCUMENT_REASSIGNED',
                },
            }),
            prisma.workflowLog.create({
                data: {
                    caseId: targetCase.id,
                    fromStatus: targetCase.status,
                    toStatus: targetCase.status,
                    action: 'QUARANTINED_DOCUMENT_REASSIGNED',
                    userId: user.id,
                    notes: note,
                },
            }),
        ]);

        logger.info(
            { id, targetCaseId: targetCase.id, forced: !targetIdPresent, userId: user.id },
            'Quarantined document reassigned',
        );

        return NextResponse.json({
            success: true,
            action: 'REASSIGNED',
            documentId: document.id,
            caseFileNumber: targetCase.fileNumber,
            ownershipConfirmed: targetIdPresent,
        });
    } catch (error) {
        logger.error('Error actioning quarantined document:', error);
        return NextResponse.json({ error: 'Failed to action quarantined document' }, { status: 500 });
    }
}
