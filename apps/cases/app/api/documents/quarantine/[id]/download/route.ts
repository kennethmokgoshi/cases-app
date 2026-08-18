/**
 * Serve a quarantined file for review — GET /api/documents/quarantine/[id]/download
 *
 * Quarantined files deliberately live outside /uploads, so they are not reachable
 * as static assets. This route is the only way to see one, and it is limited to
 * the same Admin / Executive / Senior Manager roles that can review the queue —
 * staff need to look at the document to decide where it really belongs.
 */

import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/documents/quarantine/[id]/download');

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const session = await auth();
        const user = session?.user;
        if (!user?.id || !(user.isAdmin || user.isExecutive || user.isSeniorManager)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const record = await prisma.quarantinedDocument.findUnique({
            where: { id },
            select: { storagePath: true, fileName: true, mimeType: true },
        });
        if (!record) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        const buffer = await readFile(record.storagePath);

        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                'Content-Type': record.mimeType || 'application/octet-stream',
                'Content-Disposition': `inline; filename="${record.fileName.replace(/"/g, '')}"`,
                'Cache-Control': 'private, no-store',
            },
        });
    } catch (error) {
        logger.error('Error serving quarantined document:', error);
        return NextResponse.json({ error: 'Failed to load document' }, { status: 500 });
    }
}
