import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

const logger = createLogger('api/cases/[id]/consumer-documents');

/** Resolve the Crediva consumer linked to this case's primary client. */
async function getConsumerId(caseId: string): Promise<string | null> {
    const c = await prisma.case.findUnique({
        where: { id: caseId },
        select: { client: { select: { consumerAccount: { select: { id: true } } } } },
    });
    return c?.client?.consumerAccount?.id ?? null;
}

// GET — list the consumer's portal-uploaded documents, or stream one with ?download=<docId>
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const { id: caseId } = await params;
        const consumerId = await getConsumerId(caseId);
        if (!consumerId) {
            return NextResponse.json({ documents: [], linked: false });
        }

        const { searchParams } = new URL(request.url);
        const downloadId = searchParams.get('download');

        if (downloadId) {
            const doc = await prisma.credoDocument.findFirst({
                where: { id: downloadId, consumerId },
                select: { originalName: true, mimeType: true, storagePath: true },
            });
            if (!doc || !existsSync(doc.storagePath)) {
                return NextResponse.json({ error: 'Document not found' }, { status: 404 });
            }
            const buffer = await readFile(doc.storagePath);
            return new NextResponse(new Uint8Array(buffer), {
                headers: {
                    'Content-Type': doc.mimeType || 'application/octet-stream',
                    'Content-Disposition': `inline; filename="${doc.originalName.replace(/"/g, '')}"`,
                },
            });
        }

        const documents = await prisma.credoDocument.findMany({
            where: { consumerId },
            select: {
                id: true,
                originalName: true,
                mimeType: true,
                size: true,
                category: true,
                createdAt: true,
                fulfilledRequest: { select: { id: true, label: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ documents, linked: true });
    } catch (error) {
        logger.error('Error fetching consumer documents:', error);
        return NextResponse.json({ error: 'Failed to fetch consumer documents' }, { status: 500 });
    }
}
