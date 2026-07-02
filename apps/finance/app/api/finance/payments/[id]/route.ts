import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import { z } from 'zod';

const PaymentUpdateSchema = z.object({
    amount: z.union([z.string(), z.number()]).refine(
        val => !isNaN(parseFloat(String(val))) && parseFloat(String(val)) > 0,
        { message: 'amount must be a positive number' }
    ).optional(),
    date: z.string().min(1).optional(),
    method: z.string().min(1).optional(),
    reference: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    category: z.string().min(1).optional(),
}).refine(
    data => Object.values(data).some(v => v !== undefined),
    { message: 'At least one field must be provided' }
);

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        const parsed = PaymentUpdateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
        }

        const existing = await prisma.payment.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
        }

        const { amount, date, method, reference, notes, category } = parsed.data;

        const data: Record<string, unknown> = {};
        if (amount !== undefined) data.amount = parseFloat(String(amount));
        if (date !== undefined) data.date = new Date(date);
        if (method !== undefined) data.method = method;
        if (reference !== undefined) data.reference = reference || null;
        if (notes !== undefined) data.notes = notes || null;
        if (category !== undefined) data.category = category;

        const payment = await prisma.payment.update({
            where: { id },
            data,
            include: {
                client: { select: { id: true, firstName: true, lastName: true, idNumber: true } },
                case: { select: { fileNumber: true } },
                recordedBy: { select: { firstName: true, lastName: true } },
                batch: { select: { fileName: true, status: true } } } });

        // Audit trail — WorkflowLog requires a case, so only case-linked payments get an entry
        if (existing.caseId) {
            const changes = Object.keys(data)
                .map(field => `${field}: ${String((existing as Record<string, unknown>)[field] ?? '—')} → ${String(data[field])}`)
                .join('; ');
            await prisma.workflowLog.create({
                data: {
                    caseId: existing.caseId,
                    toStatus: 'PAYMENT_EDITED',
                    action: 'PAYMENT_EDITED',
                    userId: session.user.id,
                    notes: `Payment ${id} edited — ${changes}` } });
        }

        return NextResponse.json(payment);
    } catch (error: any) {
        logger.error('[Finance] PATCH /payments/[id] error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
