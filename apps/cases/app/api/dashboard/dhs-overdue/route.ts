import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import type { Prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { getDhsOverdueAccessWhere } from '@/lib/dhs-overdue-access';

const logger = createLogger('api/dashboard/dhs-overdue');

/**
 * Both statuses that mean "a transfer request is pending an outcome on DHS".
 * Kept in step with COHORT_STATUSES in the dhs-requested-followup trigger so the
 * manual button and the scheduled automation work the same cohort.
 */
const DHS_STATUS_CODES = ['REQUESTED_VIA_DHS', 'DHS_REQUESTED'];

/**
 * Fallback overdue window for DHS_REQUESTED, which is absent from
 * WORKFLOW_STATUSES and so is never given an SLA or an isOverdue flag by
 * overdue-scan. Mirrors FALLBACK_OVERDUE_DAYS in the trigger.
 */
const FALLBACK_OVERDUE_DAYS = 7;

export interface DhsOverdueCase {
    id: string;
    fileNumber: string;
    clientName: string;
    status: string;
    daysInStatus: number;
    statusEntryDate: Date;
    projectName: string;
}

/**
 * Counts/lists cases sitting on DHS awaiting a transfer outcome that are overdue —
 * by the nightly isOverdue flag, an elapsed nextUpdate, or simply having sat in
 * the status longer than the fallback window (the only signal available for
 * DHS_REQUESTED, which carries no SLA).
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

        const now = new Date();
        const staleCutoff = new Date(now);
        staleCutoff.setDate(staleCutoff.getDate() - FALLBACK_OVERDUE_DAYS);

        const where: Prisma.CaseWhereInput = {
            deletedAt: { equals: null },
            status: { in: DHS_STATUS_CODES },
            OR: [
                { isOverdue: true },
                { nextUpdate: { lt: now } },
                { statusEntryDate: { lt: staleCutoff } },
            ],
            ...accessWhere,
        };

        const cases = await prisma.case.findMany({
            where,
            select: {
                id: true,
                fileNumber: true,
                status: true,
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
            status: c.status,
            daysInStatus: c.daysInStatus,
            statusEntryDate: c.statusEntryDate,
            projectName: c.projects[0]?.project?.name ?? 'Unknown Project',
        }));

        logger.info(`[DhsOverdue] User=${session.user.id} isAdmin=${isAdmin} found ${result.length} overdue "Requested via DHS" case(s)`);

        return NextResponse.json({
            count: result.length,
            statusCodes: DHS_STATUS_CODES,
            statusLabel: 'Requested via DHS',
            cases: result,
        });
    } catch (error: any) {
        logger.error('[DhsOverdue] Error:', error);
        return NextResponse.json({ error: 'Failed to check DHS overdue files' }, { status: 500 });
    }
}
