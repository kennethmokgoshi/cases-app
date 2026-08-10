import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { getDhsOverdueAccessWhere } from '@/lib/dhs-overdue-access';

const logger = createLogger('api/dashboard/dhs-overdue');

const DHS_STATUS_CODE = 'REQUESTED_VIA_DHS';

export interface DhsOverdueCase {
    id: string;
    fileNumber: string;
    clientName: string;
    daysInStatus: number;
    statusEntryDate: Date;
    projectName: string;
}

/**
 * Counts/lists cases stuck in the "Requested via DHS" workflow status that are
 * past their SLA (isOverdue flag, written nightly by the overdue-scan automation).
 * Only Admins see every project's cases — everyone else (including STAFF) is
 * restricted to the projects they're a ProjectMember of, or their b2bPartnerId.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = session.user.isAdmin === true || session.user.role?.toUpperCase() === 'ADMIN';
        const accessWhere = await getDhsOverdueAccessWhere(session.user);

        const where: any = {
            deletedAt: { equals: null },
            status: DHS_STATUS_CODE,
            isOverdue: true,
            ...accessWhere,
        };

        const cases = await prisma.case.findMany({
            where,
            select: {
                id: true,
                fileNumber: true,
                daysInStatus: true,
                statusEntryDate: true,
                client: { select: { firstName: true, lastName: true } },
                projects: {
                    where: { isPrimary: true },
                    take: 1,
                    select: { project: { select: { name: true } } },
                },
            },
            orderBy: { daysInStatus: 'desc' },
        });

        const result: DhsOverdueCase[] = cases.map(c => ({
            id: c.id,
            fileNumber: c.fileNumber,
            clientName: `${c.client?.firstName ?? ''} ${c.client?.lastName ?? ''}`.trim() || 'Unknown Client',
            daysInStatus: c.daysInStatus,
            statusEntryDate: c.statusEntryDate,
            projectName: c.projects[0]?.project?.name ?? 'Unknown Project',
        }));

        logger.info(`[DhsOverdue] User=${session.user.id} isAdmin=${isAdmin} found ${result.length} overdue "Requested via DHS" case(s)`);

        return NextResponse.json({
            count: result.length,
            statusCode: DHS_STATUS_CODE,
            statusLabel: 'Requested via DHS',
            cases: result,
        });
    } catch (error: any) {
        logger.error('[DhsOverdue] Error:', error);
        return NextResponse.json({ error: 'Failed to check DHS overdue files' }, { status: 500 });
    }
}
