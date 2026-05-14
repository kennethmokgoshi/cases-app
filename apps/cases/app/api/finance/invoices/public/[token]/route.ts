import { prisma } from '@zenowethu/database';
import { NextResponse } from 'next/server';
import { createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/finance/invoices/public');

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params;

        const invoice = await prisma.invoice.findUnique({
            where: { publicToken: token },
            include: {
                client: { select: { firstName: true, lastName: true, email: true, phone: true, address: true } },
                bankAccount: true,
                project: { select: { name: true, logoUrl: true, companySlogan: true } }
            }
        });

        if (!invoice) {
            return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
        }

        return NextResponse.json(invoice);
    } catch (error) {
        logger.error('Error fetching public invoice:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
