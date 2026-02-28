import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import { z } from 'zod';
import { parsePaymentBatch } from '../../../../lib/batch-parser';

const BatchQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20) });

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = /\.(xlsx|xls)$/i;

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const parsed = BatchQuerySchema.safeParse({
            page: searchParams.get('page'),
            limit: searchParams.get('limit') });

        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
        }

        const { page, limit } = parsed.data;
        const skip = (page - 1) * limit;

        const [batches, total] = await Promise.all([
            prisma.paymentBatch.findMany({
                orderBy: { uploadedAt: 'desc' },
                skip,
                take: limit,
                include: {
                    uploadedBy: { select: { firstName: true, lastName: true } },
                    _count: { select: { payments: true } } } }),
            prisma.paymentBatch.count(),
        ]);

        return NextResponse.json({ batches, total, page, pages: Math.ceil(total / limit) });
    } catch (error: any) {
        logger.error('[Finance] GET /batches error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        if (!ALLOWED_EXTENSIONS.test(file.name)) {
            return NextResponse.json({ error: 'Only .xlsx or .xls files are accepted' }, { status: 400 });
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: 'File size must not exceed 10MB' }, { status: 400 });
        }

        // ── Parse the file (auto-detects Letsatsi vs generic format) ─────────
        const arrayBuffer = await file.arrayBuffer();
        const { payments: parsedPayments, skipped, format } = parsePaymentBatch(arrayBuffer);

        if (parsedPayments.length === 0 && skipped.length === 0) {
            return NextResponse.json({ error: 'Excel file is empty or has no readable payment rows' }, { status: 400 });
        }

        // ── Build DB lookup maps ──────────────────────────────────────────────

        // 1. Look up cases by File nr (Letsatsi primary match — direct case lookup)
        const fileNrs = [...new Set(parsedPayments.map(p => p.fileNr).filter(Boolean) as string[])];
        const casesByFileNr = fileNrs.length > 0
            ? await prisma.case.findMany({
                where: { fileNumber: { in: fileNrs } },
                select: {
                    id: true,
                    fileNumber: true,
                    clientId: true } })
            : [];

        const fileNrMap = new Map<string, { caseId: string; clientId: string }>();
        for (const c of casesByFileNr) {
            if (c.fileNumber) {
                fileNrMap.set(c.fileNumber, { caseId: c.id, clientId: c.clientId });
            }
        }

        // 2. Look up clients by SA ID number (fallback match)
        const idNumbers = [...new Set(parsedPayments.map(p => p.idNumber).filter(Boolean) as string[])];
        const clientsByIdNumber = idNumbers.length > 0
            ? await prisma.client.findMany({
                where: { idNumber: { in: idNumbers } },
                select: {
                    id: true,
                    idNumber: true,
                    cases: {
                        where: { status: { notIn: ['COMPLETED', 'CLOSED', 'CANCELLED'] } },
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                        select: { id: true } } } })
            : [];

        const idNumberMap = new Map<string, { clientId: string; caseId?: string }>();
        for (const c of clientsByIdNumber) {
            idNumberMap.set(c.idNumber, {
                clientId: c.id,
                caseId: c.cases[0]?.id });
        }

        // ── Build payment rows ────────────────────────────────────────────────
        let totalAmount = 0;
        let matchCount = 0;
        let unmatchCount = 0;

        const paymentData: any[] = [];

        for (const p of parsedPayments) {
            totalAmount += p.amount;

            // Primary: match by File nr → direct case + client
            const fileNrMatch = p.fileNr ? fileNrMap.get(p.fileNr) : undefined;

            // Fallback: match by ID number → client → active case
            const idMatch = p.idNumber ? idNumberMap.get(p.idNumber) : undefined;

            const match = fileNrMatch
                ? { clientId: fileNrMatch.clientId, caseId: fileNrMatch.caseId }
                : idMatch
                    ? { clientId: idMatch.clientId, caseId: idMatch.caseId }
                    : undefined;

            if (match) {
                matchCount++;
            } else {
                unmatchCount++;
            }

            paymentData.push({
                amount: p.amount,
                date: p.date,
                method: p.method,
                reference: p.reference,
                notes: p.name,                                          // Surname and Initials from file
                status: match ? 'COMPLETED' : 'UNALLOCATED',
                category: 'INSTALLMENT',
                unmatchedId: match ? null : (p.idNumber ?? p.fileNr ?? null), // preserve ID for reconciliation
                clientId: match?.clientId ?? null,
                caseId: match?.caseId ?? null,
                recordedById: session.user.id });
        }

        // ── Create batch + payments in a transaction ──────────────────────────
        const batch = await prisma.$transaction(async (tx) => {
            const newBatch = await tx.paymentBatch.create({
                data: {
                    fileName: file.name,
                    status: matchCount > 0 ? 'MATCHED' : 'PROCESSING',
                    totalAmount,
                    matchCount,
                    unmatchCount,
                    uploadedById: session.user.id } });

            if (paymentData.length > 0) {
                await tx.payment.createMany({
                    data: paymentData.map(p => ({ ...p, batchId: newBatch.id })) });
            }

            return newBatch;
        });

        return NextResponse.json({
            batch,
            summary: {
                format,
                totalRows: parsedPayments.length + skipped.length,
                totalAmount,
                matchCount,
                unmatchCount,
                skippedCount: skipped.length,
                skippedRows: skipped } }, { status: 201 });
    } catch (error: any) {
        logger.error('[Finance] POST /batches error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
