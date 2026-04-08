import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/cases/[id]/documents/access');

// POST - Grant or revoke access to an admin-only document
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = session.user.isAdmin === true || session.user.role === 'ADMIN';
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
        }

        const { id: caseId } = await params;
        const body = await request.json();
        const { documentId, userId, action } = body as {
            documentId: string;
            userId: string;
            action: 'grant' | 'revoke';
        };

        if (!documentId || !userId || !action) {
            return NextResponse.json({ error: 'documentId, userId, and action are required' }, { status: 400 });
        }
        if (action !== 'grant' && action !== 'revoke') {
            return NextResponse.json({ error: 'action must be "grant" or "revoke"' }, { status: 400 });
        }

        // Verify document belongs to this case and is admin-only
        const document = await prisma.document.findUnique({
            where: { id: documentId },
            select: { id: true, caseId: true, isAdminOnly: true }
        });

        if (!document || document.caseId !== caseId) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }
        if (!document.isAdminOnly) {
            return NextResponse.json({ error: 'Document is not admin-only; no access grants needed' }, { status: 400 });
        }

        // Verify target user exists
        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, firstName: true, lastName: true, email: true }
        });
        if (!targetUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        if (action === 'grant') {
            const grant = await prisma.documentAccessGrant.upsert({
                where: { documentId_userId: { documentId, userId } },
                create: { documentId, userId, grantedBy: session.user.id },
                update: { grantedAt: new Date(), grantedBy: session.user.id },
                include: {
                    user: { select: { id: true, firstName: true, lastName: true, email: true } }
                }
            });
            logger.info(`Access granted: doc=${documentId} user=${userId} by=${session.user.id}`);
            return NextResponse.json({ grant });
        } else {
            await prisma.documentAccessGrant.deleteMany({
                where: { documentId, userId }
            });
            logger.info(`Access revoked: doc=${documentId} user=${userId} by=${session.user.id}`);
            return NextResponse.json({ success: true });
        }

    } catch (error) {
        logger.error('Error managing document access:', error);
        return NextResponse.json({ error: 'Failed to manage document access' }, { status: 500 });
    }
}
