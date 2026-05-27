import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

const logger = createLogger('api/admin/commissions/export');

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!session.user.isAdmin && !session.user.isExecutive && !session.user.isSeniorManager && session.user.role !== 'MANAGER') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status') || 'UNPAID'; // UNPAID, PAID, ALL

        const where: any = { isEligible: true };
        if (status === 'UNPAID') where.isPaid = false;
        else if (status === 'PAID') where.isPaid = true;

        const commissions = await prisma.referrerCommission.findMany({
            where,
            include: {
                referrer: true,
                case: {
                    include: {
                        client: true,
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Generate CSV
        const headers = [
            'Commission ID',
            'Referrer Name',
            'Referrer ID Number',
            'Referrer Bank Name',
            'Referrer Account Number',
            'Referrer Branch Code',
            'Client Name',
            'Case ID',
            'Commission Amount',
            'Status',
            'Created At'
        ];

        const rows = commissions.map(c => [
            c.id,
            `${c.referrer.firstName} ${c.referrer.lastName}`,
            c.referrer.idNumber || '',
            c.referrer.bankName || '',
            c.referrer.accountNumber || '',
            c.referrer.branchCode || '',
            `${c.case.client.firstName} ${c.case.client.lastName}`,
            c.caseId,
            c.commissionAmount?.toNumber() || 0,
            c.isPaid ? 'PAID' : 'UNPAID',
            c.createdAt.toISOString()
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        logger.info(`Exported ${commissions.length} commissions to CSV`);

        return new NextResponse(csvContent, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="commission-export-${new Date().toISOString().split('T')[0]}.csv"`,
            },
        });

    } catch (error) {
        logger.error('Error exporting commissions:', error);
        return NextResponse.json({ error: 'Failed to export' }, { status: 500 });
    }
}
