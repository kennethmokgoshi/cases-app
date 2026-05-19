import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/cases/[id]/restore');

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = session.user.isAdmin === true || session.user.role?.toUpperCase() === 'ADMIN';
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id } = await params;

        const trashed = await prisma.case.findUnique({
            where: { id },
            select: { id: true, fileNumber: true, deletedAt: true }
        });

        if (!trashed || !trashed.deletedAt) {
            return NextResponse.json({ error: 'Case not found in trash' }, { status: 404 });
        }

        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        if (trashed.deletedAt < cutoff) {
            return NextResponse.json({ error: 'Restore window has expired. This case can no longer be restored.' }, { status: 410 });
        }

        const restoredByName = session.user.name || session.user.id;
        const restoredOn = new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });

        await prisma.$transaction([
            prisma.case.update({
                where: { id },
                data: { deletedAt: null, deletedById: null },
            }),
            prisma.caseComment.create({
                data: {
                    caseId: id,
                    userId: session.user.id,
                    content: `Case restored from trash by ${restoredByName} on ${restoredOn}.`,
                    activityType: 'SYSTEM',
                    type: 'NOTE',
                    isInternal: true,
                },
            }),
        ]);

        logger.info(`Case ${trashed.fileNumber} restored by ${restoredByName} (${session.user.id})`);

        return NextResponse.json({
            success: true,
            message: `Case ${trashed.fileNumber} has been restored successfully`
        });
    } catch (error) {
        logger.error('Error restoring case:', error);
        return NextResponse.json({ error: 'Failed to restore case' }, { status: 500 });
    }
}
