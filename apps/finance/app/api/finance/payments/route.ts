import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import { checkQuoteFulfilmentSafe } from '@zenowethu/shared-lib/src/finance/quote-case-sync';
import { z } from 'zod';
import { readPaymentRequest, validateProofFile, saveProofFile } from '../../../../lib/payment-proof';

const PaymentQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    search: z.string().default(''),
    method: z.string().default(''),
    status: z.string().default(''),
    from: z.string().optional(),
    to: z.string().optional() });

const PaymentCreateSchema = z.object({
    idNumber: z.string().optional(),
    amount: z.union([z.string(), z.number()]).refine(
        val => !isNaN(parseFloat(String(val))) && parseFloat(String(val)) > 0,
        { message: 'amount must be a positive number' }
    ),
    date: z.string().min(1, 'date is required'),
    method: z.string().min(1, 'method is required'),
    reference: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    category: z.string().optional() });

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const parsed = PaymentQuerySchema.safeParse({
            // .get() returns null for absent params; Zod defaults only apply to
            // undefined, and z.coerce.number() turns null into 0 which fails min(1)
            page: searchParams.get('page') ?? undefined,
            limit: searchParams.get('limit') ?? undefined,
            search: searchParams.get('search') ?? '',
            method: searchParams.get('method') ?? '',
            status: searchParams.get('status') ?? '',
            from: searchParams.get('from') ?? undefined,
            to: searchParams.get('to') ?? undefined });

        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
        }

        const { page, limit, search, method, status, from, to } = parsed.data;
        const skip = (page - 1) * limit;

        const where: any = {};

        if (method) where.method = method;
        if (status) where.status = status;
        if (from || to) {
            where.date = {};
            if (from) where.date.gte = new Date(from);
            if (to) {
                const toDate = new Date(to);
                toDate.setHours(23, 59, 59, 999);
                where.date.lte = toDate;
            }
        }
        if (search) {
            where.OR = [
                { reference: { contains: search, mode: 'insensitive' } },
                { client: { firstName: { contains: search, mode: 'insensitive' } } },
                { client: { lastName: { contains: search, mode: 'insensitive' } } },
                { client: { idNumber: { contains: search, mode: 'insensitive' } } },
                { case: { fileNumber: { contains: search, mode: 'insensitive' } } },
            ];
        }

        const [payments, total] = await Promise.all([
            prisma.payment.findMany({
                where,
                orderBy: { date: 'desc' },
                skip,
                take: limit,
                include: {
                    client: { select: { id: true, firstName: true, lastName: true, idNumber: true } },
                    case: { select: { fileNumber: true } },
                    recordedBy: { select: { firstName: true, lastName: true } },
                    batch: { select: { fileName: true, status: true } } } }),
            prisma.payment.count({ where }),
        ]);

        return NextResponse.json({
            payments,
            total,
            page,
            pages: Math.ceil(total / limit) });
    } catch (error: any) {
        logger.error('[Finance] GET /payments error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        // Accept JSON (no attachment) or multipart/form-data (with optional proof of payment)
        const { body, proofFile } = await readPaymentRequest(request);
        const parsed = PaymentCreateSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
        }

        if (proofFile) {
            const fileError = validateProofFile(proofFile);
            if (fileError) {
                return NextResponse.json({ error: fileError }, { status: 400 });
            }
        }

        const { idNumber, amount, date, method, reference, notes, category } = parsed.data;

        // Look up the client by ID number if provided
        let clientId: string | undefined;
        let caseId: string | undefined;

        if (idNumber) {
            const client = await prisma.client.findUnique({
                where: { idNumber },
                include: {
                    cases: {
                        where: { status: { notIn: ['COMPLETED', 'CLOSED', 'CANCELLED'] } },
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                        select: { id: true } } } });
            if (client) {
                clientId = client.id;
                if (client.cases.length > 0) {
                    caseId = client.cases[0].id;
                }
            }
        }

        let payment = await prisma.payment.create({
            data: {
                amount: parseFloat(String(amount)),
                date: new Date(date),
                method,
                reference: reference || null,
                notes: notes || null,
                category: category || 'INSTALLMENT',
                status: 'COMPLETED',
                clientId: clientId || null,
                caseId: caseId || null,
                recordedById: session.user.id },
            include: {
                client: { select: { firstName: true, lastName: true } },
                case: { select: { fileNumber: true } } } });

        // Captured payments may now cover the case's accepted quote — advance
        // the case workflow (forward-only). Never fails the recorded payment.
        await checkQuoteFulfilmentSafe(payment.caseId, session.user.id);

        // Save proof of payment after the payment exists — a failed file write must
        // not lose the recorded payment, so it degrades to a warning instead
        let proofUploadError: string | undefined;
        if (proofFile) {
            try {
                const proofOfPaymentUrl = await saveProofFile(payment.id, proofFile);
                payment = await prisma.payment.update({
                    where: { id: payment.id },
                    data: { proofOfPaymentUrl },
                    include: {
                        client: { select: { firstName: true, lastName: true } },
                        case: { select: { fileNumber: true } } } });
            } catch (fileError: any) {
                logger.error('[Finance] POST /payments proof-of-payment save failed:', fileError);
                proofUploadError = 'Payment was recorded, but the proof of payment file could not be saved. You can retry by editing the payment.';
            }
        }

        return NextResponse.json(proofUploadError ? { ...payment, proofUploadError } : payment, { status: 201 });
    } catch (error: any) {
        logger.error('[Finance] POST /payments error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
