import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/cases/bulk-delete');

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Admins, Executives, Senior Managers, and Managers may bulk delete
        const isManager = session.user.isManager === true;
        if (!isManager) {
            return NextResponse.json({ error: 'Only Managers and above can bulk delete cases' }, { status: 403 });
        }

        const body = await request.json();
        const { caseIds } = body as { caseIds: string[] };

        if (!Array.isArray(caseIds) || caseIds.length === 0) {
            return NextResponse.json({ error: 'No case IDs provided' }, { status: 400 });
        }

        if (caseIds.length > 200) {
            return NextResponse.json({ error: 'Maximum 200 cases per bulk delete' }, { status: 400 });
        }

        // Fetch only non-deleted cases from the provided IDs
        const existingCases = await prisma.case.findMany({
            where: { id: { in: caseIds }, deletedAt: null },
            select: { id: true, fileNumber: true },
        });

        const existingIds = new Set(existingCases.map(c => c.id));
        const notFound = caseIds.filter(id => !existingIds.has(id));

        const now = new Date();
        const deletedByName = session.user.name || session.user.id;
        const deletedOn = now.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });

        // Run soft-delete and activity logs in a single transaction
        await prisma.$transaction([
            prisma.case.updateMany({
                where: { id: { in: Array.from(existingIds) } },
                data: { deletedAt: now, deletedById: session.user.id },
            }),
            prisma.caseComment.createMany({
                data: existingCases.map(c => ({
                    caseId: c.id,
                    userId: session.user.id,
                    content: `Case moved to trash by ${deletedByName} on ${deletedOn}.`,
                    activityType: 'SYSTEM',
                    type: 'NOTE',
                    isInternal: true,
                })),
            }),
        ]);

        const succeeded = existingCases.map(c => c.fileNumber);
        const failed = notFound.map(id => ({ fileNumber: id, reason: 'Not found or already deleted' }));

        logger.info(`Bulk delete: ${existingCases.length} cases soft-deleted by ${deletedByName} (${session.user.id})`);

        return NextResponse.json({
            success: true,
            deleted: existingCases.length,
            succeeded,
            failed,
            message: `${existingCases.length} case${existingCases.length !== 1 ? 's' : ''} moved to trash. They will be permanently deleted in 30 days.`,
        });
    } catch (error) {
        logger.error('Bulk delete error:', error);
        return NextResponse.json({ error: 'Failed to bulk delete cases' }, { status: 500 });
    }
}
