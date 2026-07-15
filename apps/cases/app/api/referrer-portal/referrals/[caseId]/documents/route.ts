import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger, touchCaseAction } from '@zenowethu/shared-lib';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';
import { parseMultipartForm } from '@/lib/form-parser';
import { formatDocumentTypeLabel, REFERRER_COMMENT_TYPE } from '@/lib/referrer-portal';

const logger = createLogger('api/referrer-portal/referrals/documents');

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
    try {
        const access = await getCurrentReferrerPortalAccess();
        if (access.ok !== true) return NextResponse.json({ error: access.error }, { status: access.status });

        const { caseId } = await params;

        // Verify that the case exists and is linked to this referrer
        const referralCase = await prisma.case.findFirst({
            where: { id: caseId, referrerId: access.referrer.id, deletedAt: null },
            select: { id: true, fileNumber: true, assignedToId: true },
        });

        if (!referralCase) return NextResponse.json({ error: 'Referral not found' }, { status: 404 });

        const { fields, files } = await parseMultipartForm(request);

        const documentType = fields.documentType;
        const notesRaw = fields.notes;

        if (!documentType) {
            return NextResponse.json({ error: 'Document type is required' }, { status: 400 });
        }

        if (files.length === 0) {
            return NextResponse.json({ error: 'Document file is required' }, { status: 400 });
        }

        const file = files[0];

        // Ensure storage directory exists
        const uploadsDir = join(process.cwd(), 'storage', 'uploads', caseId);
        if (!existsSync(uploadsDir)) {
            await mkdir(uploadsDir, { recursive: true });
        }

        // Save the file
        const timestamp = Date.now();
        const fileName = `${timestamp}-${file.name}`;
        const filePath = join(uploadsDir, fileName);
        const fileUrl = `/uploads/${caseId}/${fileName}`;
        const fileSize = file.buffer.length;

        await writeFile(filePath, file.buffer);

        // Create the Document record
        const document = await prisma.document.create({
            data: {
                caseId,
                type: documentType,
                fileName: file.name,
                fileUrl,
                fileSize,
                mimeType: file.type,
                uploadedById: access.sessionUserId,
            },
        });

        const docTypeLabel = formatDocumentTypeLabel(documentType);

        // Create a CaseComment in discussion thread
        const commentContent = `[SYSTEM AUTO-MESSAGE] Document uploaded: "${file.name}" (${docTypeLabel}). Notes: ${notesRaw || 'None'}`;
        const comment = await prisma.caseComment.create({
            data: {
                caseId,
                userId: access.sessionUserId,
                content: commentContent,
                type: REFERRER_COMMENT_TYPE,
                isInternal: false,
                activityType: 'REFERRER_COMMENT',
            },
            select: {
                id: true,
                content: true,
                createdAt: true,
                user: { select: { firstName: true, lastName: true, userType: true } },
            },
        });

        await touchCaseAction(caseId, 'DOCUMENT_UPLOAD', { userId: access.sessionUserId });

        // Notify assigned staff user if any
        if (referralCase.assignedToId) {
            await prisma.inAppNotification.create({
                data: {
                    userId: referralCase.assignedToId,
                    type: 'REFERRER_DOCUMENT_UPLOAD',
                    title: `Document uploaded on ${referralCase.fileNumber}`,
                    message: `${access.referrer.firstName} uploaded a ${docTypeLabel}: "${file.name}"`,
                    caseId,
                    linkUrl: `/cases/${caseId}`,
                },
            }).catch((err: unknown) => logger.error('Failed to notify staff of document upload', err));
        }

        return NextResponse.json({
            success: true,
            document: { id: document.id, label: docTypeLabel, uploadedAt: document.uploadedAt },
            comment: { id: comment.id, content: comment.content, createdAt: comment.createdAt, authorName: access.referrer.firstName, fromReferrer: true }
        }, { status: 201 });
    } catch (error) {
        logger.error('Failed to process document upload', error);
        return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 });
    }
}
