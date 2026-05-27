import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

const logger = createLogger('api/admin/commissions/export-eft');

/**
 * GET /api/admin/commissions/export-eft
 *
 * Generates a bank-uploadable EFT payment CSV for unpaid eligible commissions.
 * Columns match the standard SA bank EFT import format:
 *   Beneficiary Name, Bank Name, Account Number, Branch Code, Amount, Reference
 *
 * Query params:
 *   - commissionIds (optional, comma-separated) — specific commissions to include
 *     If omitted, exports ALL unpaid eligible commissions.
 */
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
        const idsParam = searchParams.get('commissionIds');

        const where: any = { isEligible: true, isPaid: false };
        if (idsParam) {
            where.id = { in: idsParam.split(',').map(s => s.trim()).filter(Boolean) };
        }

        const commissions = await prisma.referrerCommission.findMany({
            where,
            include: {
                referrer: true,
                case: {
                    include: {
                        client: { select: { firstName: true, lastName: true } },
                    }
                }
            },
            orderBy: { referrer: { lastName: 'asc' } }
        });

        if (commissions.length === 0) {
            return NextResponse.json({ error: 'No unpaid eligible commissions to export' }, { status: 400 });
        }

        // Standard SA bank EFT CSV headers
        const headers = [
            'Beneficiary Name',
            'Bank Name',
            'Account Number',
            'Branch Code',
            'Account Type',
            'Amount',
            'Reference',
            'Client Name',
            'Case File'
        ];

        const rows = commissions.map(c => {
            const referrer = c.referrer;
            const beneficiaryName = referrer.accountHolderName || `${referrer.firstName} ${referrer.lastName}`;
            const amount = c.commissionAmount?.toNumber() || 0;
            const clientName = `${c.case.client.firstName} ${c.case.client.lastName}`;

            return [
                beneficiaryName,
                referrer.bankName || 'UNKNOWN',
                referrer.accountNumber || '',
                referrer.branchCode || '',
                referrer.accountType || 'SAVINGS',
                amount.toFixed(2),
                `ZENO-COMM-${c.id.slice(-6).toUpperCase()}`,
                clientName,
                c.caseId
            ];
        });

        const totalAmount = rows.reduce((sum, row) => sum + parseFloat(row[5]), 0);

        // Add summary row
        rows.push([
            '--- TOTAL ---',
            '',
            '',
            '',
            '',
            totalAmount.toFixed(2),
            `${commissions.length} payments`,
            '',
            ''
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const dateStamp = new Date().toISOString().split('T')[0];

        logger.info(`Exported EFT payment file: ${commissions.length} commissions, total R${totalAmount.toFixed(2)}`);

        return new NextResponse(csvContent, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="eft-payment-${dateStamp}.csv"`,
            },
        });

    } catch (error) {
        logger.error('Error exporting EFT file:', error);
        return NextResponse.json({ error: 'Failed to export' }, { status: 500 });
    }
}
