import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import { checkQuoteFulfilmentSafe } from '@zenowethu/shared-lib/src/finance/quote-case-sync';
import { resyncCaseArrangements } from '@zenowethu/shared-lib/src/payments/payment-arrangement-service';
import { z } from 'zod';
import { readPaymentRequest, validateProofFile, saveProofFile } from '../../../../../lib/payment-proof';

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
    // Re-point an already-captured payment at a different month, or pass null to
    // release it back to automatic oldest-month-first matching.
    instalmentId: z.string().nullable().optional(),
});

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
        const { body, proofFile } = await readPaymentRequest(request);
        const parsed = PaymentUpdateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
        }
        if (!proofFile && !Object.values(parsed.data).some(v => v !== undefined)) {
            return NextResponse.json({ error: 'At least one field must be provided' }, { status: 400 });
        }
        if (proofFile) {
            const fileError = validateProofFile(proofFile);
            if (fileError) {
                return NextResponse.json({ error: fileError }, { status: 400 });
            }
        }

        const existing = await prisma.payment.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
        }

        const { amount, date, method, reference, notes, category, instalmentId } = parsed.data;

        // Validate the target month belongs to this payment's case before touching it.
        if (instalmentId) {
            const instalment = await prisma.paymentArrangementInstalment.findUnique({
                where: { id: instalmentId },
                select: { arrangement: { select: { caseId: true, clientId: true } } } });
            if (!instalment) {
                return NextResponse.json({ error: 'Instalment not found' }, { status: 404 });
            }
            const belongs = existing.caseId
                ? instalment.arrangement.caseId === existing.caseId
                : instalment.arrangement.clientId === existing.clientId;
            if (!belongs) {
                return NextResponse.json(
                    { error: 'That instalment belongs to a different case' },
                    { status: 400 }
                );
            }
        }

        const data: Record<string, unknown> = {};
        if (amount !== undefined) data.amount = parseFloat(String(amount));
        if (date !== undefined) data.date = new Date(date);
        if (method !== undefined) data.method = method;
        if (reference !== undefined) data.reference = reference || null;
        if (notes !== undefined) data.notes = notes || null;
        if (category !== undefined) data.category = category;
        if (instalmentId !== undefined) data.instalmentId = instalmentId;
        // New proof replaces the previous URL; the old file stays on disk for audit
        if (proofFile) data.proofOfPaymentUrl = await saveProofFile(id, proofFile);

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

        // An edited amount may now cover the case's accepted quote — advance
        // the case workflow (forward-only). Never fails the edit itself.
        if (amount !== undefined) {
            await checkQuoteFulfilmentSafe(existing.caseId, session.user.id);
        }

        // A changed amount, date or month allocation moves the schedule — re-summarise
        // it and the Finance "Next Payment Date". Never fails the edit itself.
        if (amount !== undefined || date !== undefined || instalmentId !== undefined) {
            try {
                await resyncCaseArrangements(existing.caseId);
            } catch (syncError) {
                logger.error('[Finance] PATCH /payments/[id] arrangement resync failed:', syncError);
            }
        }

        return NextResponse.json(payment);
    } catch (error: any) {
        logger.error('[Finance] PATCH /payments/[id] error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
