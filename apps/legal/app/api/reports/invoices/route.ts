import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { logger } from '@zenowethu/shared-lib';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const from = searchParams.get('from');
        const to = searchParams.get('to');

        const dateFilter = from && to ? {
            createdAt: {
                gte: new Date(from),
                lte: new Date(to + 'T23:59:59.999Z')
            }
        } : {};

        // Get B2C cases that haven't paid (feePaid = false)
        const pendingInvoices = await prisma.case.findMany({
            where: {
                ...dateFilter,
                acquisitionType: 'B2C',
                r350Status: 'PENDING',
                status: {
                    notIn: ['COMPLETED', 'CLOSED', 'CANCELLED']
                }
            },
            include: {
                client: {
                    select: {
                        firstName: true,
                        lastName: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const invoices = pendingInvoices.map(c => ({
            id: c.id,
            fileNumber: c.fileNumber,
            clientName: `${c.client.firstName} ${c.client.lastName}`,
            amount: 350, // R350 standard fee
            status: 'Pending',
            date: c.createdAt.toISOString().split('T')[0]
        }));

        return NextResponse.json(invoices);
    } catch (error) {
        logger.error('Error fetching invoices:', error);
        return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
    }
}

