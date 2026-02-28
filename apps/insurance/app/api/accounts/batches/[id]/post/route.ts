
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    const userRole = (session?.user as any)?.role;

    if (!session?.user?.id || !['ADMIN', 'FINANCE', 'ACCOUNTS'].includes(userRole || '')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    try {
        // verify batch exists
        const batch = await prisma.paymentBatch.findUnique({
            where: { id }
        });

        if (!batch) {
            return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
        }

        // Update all PENDING payments in this batch to COMPLETED
        // UNALLOCATED payments remain UNALLOCATED until fixed.
        const result = await prisma.payment.updateMany({
            where: {
                batchId: id,
                status: 'PENDING'
            },
            data: {
                status: 'COMPLETED'
            }
        });

        return NextResponse.json({
            success: true,
            count: result.count,
            message: `Successfully posted ${result.count} payments.`
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
