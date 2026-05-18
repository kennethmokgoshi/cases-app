import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/admin/trash');

const TRASH_RETENTION_DAYS = 30;

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = session.user.isAdmin === true || session.user.role?.toUpperCase() === 'ADMIN';
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const cases = await prisma.case.findMany({
            where: { deletedAt: { not: null } },
            select: {
                id: true,
                fileNumber: true,
                status: true,
                deletedAt: true,
                deletedBy: {
                    select: { firstName: true, lastName: true }
                },
                client: {
                    select: { firstName: true, lastName: true, idNumber: true }
                }
            },
            orderBy: { deletedAt: 'desc' }
        });

        const now = new Date();
        const enriched = cases.map(c => {
            const deletedMs = now.getTime() - c.deletedAt!.getTime();
            const daysElapsed = Math.floor(deletedMs / (1000 * 60 * 60 * 24));
            const daysRemaining = Math.max(0, TRASH_RETENTION_DAYS - daysElapsed);
            const purgeAt = new Date(c.deletedAt!.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
            return { ...c, daysRemaining, purgeAt };
        });

        return NextResponse.json(enriched);
    } catch (error) {
        logger.error('Error fetching trash:', error);
        return NextResponse.json({ error: 'Failed to fetch trash' }, { status: 500 });
    }
}

// Permanently purge all cases that have been in trash for 30+ days
export async function DELETE() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = session.user.isAdmin === true || session.user.role?.toUpperCase() === 'ADMIN';
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);

        const expiredCases = await prisma.case.findMany({
            where: { deletedAt: { not: null, lte: cutoff } },
            select: { id: true, fileNumber: true, clientId: true }
        });

        if (expiredCases.length === 0) {
            return NextResponse.json({ success: true, purged: 0, message: 'No expired cases to purge' });
        }

        const ids = expiredCases.map(c => c.id);

        // Cascade-delete all related records before hard deleting
        await prisma.commentMention.deleteMany({ where: { comment: { caseId: { in: ids } } } });
        await prisma.caseComment.deleteMany({ where: { caseId: { in: ids } } });
        await prisma.caseProject.deleteMany({ where: { caseId: { in: ids } } });
        await prisma.document.deleteMany({ where: { caseId: { in: ids } } });
        await prisma.workflowLog.deleteMany({ where: { caseId: { in: ids } } });
        await prisma.notificationLog.deleteMany({ where: { caseId: { in: ids } } });
        await prisma.case.deleteMany({ where: { id: { in: ids } } });

        // Clean up orphaned clients (no remaining active or trashed cases)
        for (const c of expiredCases) {
            const remaining = await prisma.case.count({ where: { clientId: c.clientId } });
            if (remaining === 0) {
                try {
                    await prisma.client.delete({ where: { id: c.clientId } });
                } catch (err) {
                    logger.error(`Failed to delete orphaned client ${c.clientId}:`, err);
                }
            }
        }

        logger.info(`Purged ${expiredCases.length} expired cases by user ${session.user.id}`);

        return NextResponse.json({
            success: true,
            purged: expiredCases.length,
            message: `${expiredCases.length} case(s) permanently deleted`
        });
    } catch (error) {
        logger.error('Error purging trash:', error);
        return NextResponse.json({ error: 'Failed to purge trash' }, { status: 500 });
    }
}
