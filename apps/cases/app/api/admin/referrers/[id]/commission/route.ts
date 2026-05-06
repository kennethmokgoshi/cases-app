import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { z } from 'zod';

const logger = createLogger('api/admin/referrers/[id]/commission');

function isAdminLevel(session: { user: { isAdmin?: boolean; isExecutive?: boolean; isSeniorManager?: boolean; role?: string } }) {
    return session.user.isAdmin || session.user.isExecutive || session.user.isSeniorManager || session.user.role === 'MANAGER';
}

// GET /api/admin/referrers/[id]/commission
// Returns all commission records for this referrer, including case + client info
export async function GET(_req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (!isAdminLevel(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const referrer = await prisma.referrer.findUnique({ where: { id: params.id } });
        if (!referrer) return NextResponse.json({ error: 'Referrer not found' }, { status: 404 });

        const commissions = await prisma.referrerCommission.findMany({
            where: { referrerId: params.id },
            include: {
                case: {
                    select: {
                        id: true,
                        fileNumber: true,
                        status: true,
                        createdAt: true,
                        client: { select: { firstName: true, lastName: true, idNumber: true, phone: true } },
                    },
                },
                paidBy: { select: { firstName: true, lastName: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        const summary = {
            total: commissions.length,
            eligible: commissions.filter((c) => c.isEligible).length,
            paid: commissions.filter((c) => c.isPaid).length,
            unpaidEligible: commissions.filter((c) => c.isEligible && !c.isPaid).length,
            totalAmountOwed: commissions
                .filter((c) => c.isEligible && !c.isPaid && c.commissionAmount)
                .reduce((sum, c) => sum + Number(c.commissionAmount), 0),
            totalAmountPaid: commissions
                .filter((c) => c.isPaid && c.commissionAmount)
                .reduce((sum, c) => sum + Number(c.commissionAmount), 0),
        };

        return NextResponse.json({ referrer, commissions, summary });
    } catch (error) {
        logger.error('Error fetching commissions:', error);
        return NextResponse.json({ error: 'Failed to fetch commissions' }, { status: 500 });
    }
}
