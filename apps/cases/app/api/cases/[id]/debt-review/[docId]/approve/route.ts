import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { stat } from 'fs/promises';
import path from 'path';

const logger = createLogger('api/cases/[id]/debt-review/[docId]/approve');

type RouteContext = { params: Promise<{ id: string; docId: string }> };

// PATCH /api/cases/[id]/debt-review/[docId]/approve
// Staff (SENIOR_MANAGER+, ADMIN, EXECUTIVE) approves a generated document.
// Sets status → APPROVED, records approvedById + approvedAt.
export async function PATCH(_req: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Only senior staff may approve
        const user = session.user as {
            id: string;
            isAdmin?: boolean;
            isExecutive?: boolean;
            isSeniorManager?: boolean;
            role?: string;
        };
        const canApprove =
            user.isAdmin ||
            user.isExecutive ||
            user.isSeniorManager ||
            user.role === 'SENIOR_MANAGER' ||
            user.role === 'MANAGER';

        if (!canApprove) {
            return NextResponse.json(
                { error: 'Forbidden: only Senior Manager, Manager, Executive or Admin may approve documents' },
                { status: 403 }
            );
        }

        const { id: caseId, docId } = await params;

        const doc = await prisma.debtReviewDocument.findFirst({
            where: { id: docId, caseId },
        });

        if (!doc) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        if (!doc.fileUrl) {
            return NextResponse.json(
                { error: 'Document has not been generated yet — generate it before approving' },
                { status: 422 }
            );
        }

        if (doc.status === 'APPROVED' || doc.status === 'SENT_TO_CREDITORS') {
            return NextResponse.json(
                { error: `Document is already in status: ${doc.status}` },
                { status: 409 }
            );
        }

        const now = new Date();
        const updated = await prisma.debtReviewDocument.update({
            where: { id: docId },
            data: {
                status:       'APPROVED',
                approvedById: user.id,
                approvedAt:   now,
            },
            include: {
                approvedBy: { select: { id: true, firstName: true, lastName: true } },
            },
        });

        logger.info(`Document ${docId} (${doc.documentType}) approved by user ${user.id} for case ${caseId}`);

        // Sync the approved document into the case vault (Document table) so the
        // debt-review-removal path checks (A→B, C→G) can see it. Only approved
        // documents are synced — drafts must never satisfy a removal path.
        try {
            const fileName = doc.fileUrl.split('/').pop() ?? `${doc.documentType}.pdf`;
            let fileSize = 0;
            if (doc.fileUrl.startsWith('/uploads/')) {
                const filePath = path.join(process.cwd(), 'public', doc.fileUrl.replace(/^\//, ''));
                fileSize = (await stat(filePath).catch(() => null))?.size ?? 0;
            }

            const existingVaultDoc = await prisma.document.findFirst({
                where: { caseId, type: doc.documentType },
            });
            if (existingVaultDoc) {
                await prisma.document.update({
                    where: { id: existingVaultDoc.id },
                    data:  { fileUrl: doc.fileUrl, fileName, fileSize },
                });
            } else {
                await prisma.document.create({
                    data: {
                        caseId,
                        type:         doc.documentType,
                        fileName,
                        fileUrl:      doc.fileUrl,
                        fileSize,
                        mimeType:     'application/pdf',
                        uploadedById: user.id,
                    },
                });
            }
        } catch (vaultError) {
            // Vault sync must never fail the approval itself
            logger.error(`Failed to sync approved document ${docId} into the case vault:`, vaultError);
        }

        return NextResponse.json({ success: true, document: updated });
    } catch (error) {
        logger.error('Error approving debt review document:', error);
        return NextResponse.json({ error: 'Failed to approve document' }, { status: 500 });
    }
}
