import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, logger } from '@zenowethu/shared-lib';
import { z } from 'zod';
import { canTransition, MANDATE_FREQUENCIES, MANDATE_STATUSES } from '../../../../../../lib/mandate-status';

// ── Validation ────────────────────────────────────────────────────────────────

const BankingSchema = z.object({
    bankName: z.string().max(100).nullish(),
    accountHolderName: z.string().max(150).nullish(),
    accountNumber: z.string().max(40).nullish(),
    accountType: z.string().max(40).nullish(),
    branchCode: z.string().max(20).nullish(),
    debitOrderDay: z.coerce.number().int().min(1).max(31).nullish(),
});

const UpsertSchema = BankingSchema.extend({
    requested: z.boolean().optional(),
    amount: z.coerce.number().positive().nullish(),
    frequency: z.enum(MANDATE_FREQUENCIES).optional(),
    numInstalments: z.coerce.number().int().positive().nullish(),
    firstCollectionDate: z.string().nullish(),
    lastCollectionDate: z.string().nullish(),
    notes: z.string().max(2000).nullish(),
    // also persist banking back onto the client record
    saveBankingToClient: z.boolean().optional().default(true),
});

const PatchSchema = z.object({
    status: z.enum(MANDATE_STATUSES).optional(),
    signedReturned: z.boolean().optional(),
    signedDocumentId: z.string().nullish(),
    nupayDocumentId: z.string().nullish(),
    nupayReference: z.string().max(100).nullish(),
    notes: z.string().max(2000).nullish(),
});

// ── GET — banking + latest mandate for the case ──────────────────────────────

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

        const { id } = await params;

        const caseRecord = await prisma.case.findUnique({
            where: { id },
            select: {
                id: true,
                fileNumber: true,
                serviceFee: true,
                instalments: true,
                totalDebtAmount: true,
                totalMonthlyInstallment: true,
                client: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        idNumber: true,
                        email: true,
                        phone: true,
                        address: true,
                        bankName: true,
                        accountHolderName: true,
                        accountNumber: true,
                        accountType: true,
                        branchCode: true,
                        debitOrderDay: true,
                    },
                },
            },
        });

        if (!caseRecord) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

        const mandate = await prisma.debitOrderMandate.findFirst({
            where: { caseId: id },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ case: caseRecord, client: caseRecord.client, mandate });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('[Finance] GET /cases/[id]/mandate error:', error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

// ── POST — create or update the case's mandate (and optionally client banking) ─

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

        const { id } = await params;
        const parsed = UpsertSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
        }
        const d = parsed.data;

        const caseRecord = await prisma.case.findUnique({
            where: { id },
            select: { id: true, clientId: true },
        });
        if (!caseRecord) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

        const bankingData = {
            bankName: d.bankName ?? undefined,
            accountHolderName: d.accountHolderName ?? undefined,
            accountNumber: d.accountNumber ?? undefined,
            accountType: d.accountType ?? undefined,
            branchCode: d.branchCode ?? undefined,
            debitOrderDay: d.debitOrderDay ?? undefined,
        };

        const existing = await prisma.debitOrderMandate.findFirst({
            where: { caseId: id },
            orderBy: { createdAt: 'desc' },
        });

        const mandateData = {
            requested: d.requested ?? existing?.requested ?? false,
            bankName: d.bankName ?? existing?.bankName ?? null,
            accountHolderName: d.accountHolderName ?? existing?.accountHolderName ?? null,
            accountNumber: d.accountNumber ?? existing?.accountNumber ?? null,
            accountType: d.accountType ?? existing?.accountType ?? null,
            branchCode: d.branchCode ?? existing?.branchCode ?? null,
            amount: d.amount ?? existing?.amount ?? null,
            frequency: d.frequency ?? existing?.frequency ?? 'MONTHLY',
            numInstalments: d.numInstalments ?? existing?.numInstalments ?? null,
            debitOrderDay: d.debitOrderDay ?? existing?.debitOrderDay ?? null,
            firstCollectionDate: d.firstCollectionDate ? new Date(d.firstCollectionDate) : existing?.firstCollectionDate ?? null,
            lastCollectionDate: d.lastCollectionDate ? new Date(d.lastCollectionDate) : existing?.lastCollectionDate ?? null,
            notes: d.notes ?? existing?.notes ?? null,
        };

        const [mandate] = await prisma.$transaction([
            existing
                ? prisma.debitOrderMandate.update({ where: { id: existing.id }, data: mandateData })
                : prisma.debitOrderMandate.create({
                    data: {
                        ...mandateData,
                        caseId: id,
                        clientId: caseRecord.clientId,
                        status: 'DRAFT',
                        recordedById: session.user.id,
                    },
                }),
            ...(d.saveBankingToClient
                ? [prisma.client.update({ where: { id: caseRecord.clientId }, data: bankingData })]
                : []),
        ]);

        return NextResponse.json({ mandate }, { status: existing ? 200 : 201 });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('[Finance] POST /cases/[id]/mandate error:', error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

// ── PATCH — status changes, sign-back, document links ────────────────────────

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

        const { id } = await params;
        const parsed = PatchSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
        }
        const d = parsed.data;

        const existing = await prisma.debitOrderMandate.findFirst({
            where: { caseId: id },
            orderBy: { createdAt: 'desc' },
        });
        if (!existing) return NextResponse.json({ error: 'No mandate found for this case' }, { status: 404 });

        if (d.status && !canTransition(existing.status, d.status)) {
            return NextResponse.json(
                { error: `Cannot change mandate status from ${existing.status} to ${d.status}` },
                { status: 400 }
            );
        }

        const data: Record<string, unknown> = {};
        if (d.status) data.status = d.status;
        if (d.signedReturned !== undefined) data.signedReturnedAt = d.signedReturned ? new Date() : null;
        if (d.signedDocumentId !== undefined) data.signedDocumentId = d.signedDocumentId;
        if (d.nupayDocumentId !== undefined) data.nupayDocumentId = d.nupayDocumentId;
        if (d.nupayReference !== undefined) data.nupayReference = d.nupayReference;
        if (d.nupayDocumentId) data.nupayRegisteredAt = new Date();
        if (d.notes !== undefined) data.notes = d.notes;

        const mandate = await prisma.debitOrderMandate.update({ where: { id: existing.id }, data });
        return NextResponse.json({ mandate });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('[Finance] PATCH /cases/[id]/mandate error:', error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
