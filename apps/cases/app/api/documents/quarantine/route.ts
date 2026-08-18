/**
 * Quarantined document queue — GET /api/documents/quarantine
 *
 * Lists attachments that arrived on a case's email thread but whose contents
 * belong to a different consumer, so they were never attached to that case.
 *
 * Access is restricted to Admin / Executive / Senior Manager: by definition every
 * row here holds one consumer's document sitting against another consumer's file,
 * so it must not be visible to general staff or to B2B partner users.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/documents/quarantine');

export async function GET(request: Request) {
    try {
        const session = await auth();
        const user = session?.user;
        if (!user || !(user.isAdmin || user.isExecutive || user.isSeniorManager)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status') || 'PENDING_REVIEW';
        const take = Math.min(parseInt(searchParams.get('take') || '50', 10) || 50, 200);
        const skip = parseInt(searchParams.get('skip') || '0', 10) || 0;

        const where = status === 'ALL' ? {} : { status };

        const [items, total, pendingCount] = await Promise.all([
            prisma.quarantinedDocument.findMany({
                where,
                take,
                skip,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    fileName: true,
                    fileSize: true,
                    mimeType: true,
                    detectedType: true,
                    reason: true,
                    extractedIdNumber: true,
                    expectedIdNumber: true,
                    allExtractedIds: true,
                    sourceFrom: true,
                    sourceSubject: true,
                    sourceDate: true,
                    status: true,
                    reviewedAt: true,
                    reviewNotes: true,
                    createdAt: true,
                    intendedCase: {
                        select: {
                            id: true,
                            fileNumber: true,
                            client: { select: { firstName: true, lastName: true, idNumber: true } },
                        },
                    },
                    reassignedToCase: { select: { id: true, fileNumber: true } },
                    reviewedBy: { select: { firstName: true, lastName: true } },
                    sourceMailbox: { select: { emailAddress: true } },
                },
            }),
            prisma.quarantinedDocument.count({ where }),
            prisma.quarantinedDocument.count({ where: { status: 'PENDING_REVIEW' } }),
        ]);

        return NextResponse.json({ items, total, pendingCount });
    } catch (error) {
        logger.error('Error fetching quarantined documents:', error);
        return NextResponse.json({ error: 'Failed to fetch quarantined documents' }, { status: 500 });
    }
}
