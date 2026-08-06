import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { z } from 'zod';
import {
    CREDIT_REPORT_DOC_TYPES,
    accountsMatch,
    mapExtractedAccountToCandidate,
    mapExtractedAdverseListingToCandidate,
} from '@/lib/credit-account-sync';

const logger = createLogger('api/cases/[id]/credit-accounts/sync');

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: caseId } = await context.params;

        const caseData = await prisma.case.findUnique({
            where: { id: caseId },
            include: { documents: true, creditAccounts: true },
        });

        if (!caseData) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        const creditReportDocs = (caseData.documents || []).filter(d =>
            CREDIT_REPORT_DOC_TYPES.has((d.type || '').toUpperCase())
        );
        const analyzedDocs = creditReportDocs.filter(d => d.extractedData);
        const unanalyzedDocs = creditReportDocs.filter(d => !d.extractedData);

        const existingAccounts = (caseData.creditAccounts || []).map(a => ({
            id: a.id,
            creditorName: a.creditorName,
            accountNumber: a.accountNumber,
        }));

        const candidates: ReturnType<typeof mapExtractedAccountToCandidate>[] = [];
        const seenWithinBatch: { creditorName: string; accountNumber: string | null }[] = [];

        for (const doc of analyzedDocs) {
            let parsed: any;
            try {
                parsed = JSON.parse(doc.extractedData as string);
            } catch {
                continue;
            }
            const accounts = Array.isArray(parsed?.accounts) ? parsed.accounts : [];
            for (const raw of accounts) {
                const candidate = mapExtractedAccountToCandidate(raw, { id: doc.id, type: doc.type }, existingAccounts);
                const dupWithinBatch = seenWithinBatch.some(s => accountsMatch(s, candidate));
                if (dupWithinBatch) continue;
                seenWithinBatch.push({ creditorName: candidate.creditorName, accountNumber: candidate.accountNumber });
                candidates.push(candidate);
            }

            // Written-off/handed-over/judgment accounts live in a separate array — a report
            // can have real, currently-owed debt here with an empty `accounts` array.
            const adverseListings = Array.isArray(parsed?.adverseListings) ? parsed.adverseListings : [];
            for (const raw of adverseListings) {
                const candidate = mapExtractedAdverseListingToCandidate(raw, { id: doc.id, type: doc.type }, existingAccounts);
                const dupWithinBatch = seenWithinBatch.some(s => accountsMatch(s, candidate));
                if (dupWithinBatch) continue;
                seenWithinBatch.push({ creditorName: candidate.creditorName, accountNumber: candidate.accountNumber });
                candidates.push(candidate);
            }
        }

        return NextResponse.json({
            documentsScanned: creditReportDocs.map(d => ({
                id: d.id,
                type: d.type,
                fileName: d.fileName,
                analyzed: Boolean(d.extractedData),
            })),
            needsAnalysis: unanalyzedDocs.map(d => ({ id: d.id, type: d.type, fileName: d.fileName })),
            candidates,
        });
    } catch (err: any) {
        logger.error('Failed to build credit account sync preview', err);
        return NextResponse.json(
            { error: err.message || 'Failed to build sync preview' },
            { status: 500 }
        );
    }
}

const AccountInputSchema = z.object({
    include: z.boolean(),
    creditorName: z.string().min(1).max(200),
    accountNumber: z.string().max(100).nullable().optional(),
    accountType: z.string().min(1).max(100),
    outstandingBalance: z.number().nonnegative(),
    monthlyInstalment: z.number().nonnegative().nullable().optional(),
    lastPaymentDate: z.string().nullable().optional(),
    accountOpenDate: z.string().nullable().optional(),
    termMonths: z.number().int().nonnegative().nullable().optional(),
    status: z.string().min(1).max(100),
    hasInsurance: z.boolean().optional(),
    premiumAmount: z.number().nonnegative().nullable().optional(),
    existingAccountId: z.string().nullable().optional(),
});

const SyncCommitSchema = z.object({
    accounts: z.array(AccountInputSchema).min(1),
});

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: caseId } = await context.params;

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const parsed = SyncCommitSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });
        }

        const caseData = await prisma.case.findUnique({
            where: { id: caseId },
            select: { id: true, clientId: true },
        });
        if (!caseData) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        const included = parsed.data.accounts.filter(a => a.include);
        if (included.length === 0) {
            return NextResponse.json({ error: 'No accounts selected' }, { status: 422 });
        }

        let created = 0;
        let updated = 0;

        for (const acc of included) {
            const lastPaymentDate = acc.lastPaymentDate ? new Date(acc.lastPaymentDate) : null;
            const isPrescribed = lastPaymentDate
                ? (Date.now() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25) >= 3
                : false;

            if (acc.existingAccountId) {
                await prisma.creditAccount.update({
                    where: { id: acc.existingAccountId },
                    data: {
                        outstandingBalance: acc.outstandingBalance,
                        monthlyInstalment: acc.monthlyInstalment ?? null,
                        lastPaymentDate,
                        status: acc.status,
                        isPrescribed,
                    },
                });
                updated++;
            } else {
                await prisma.creditAccount.create({
                    data: {
                        caseId,
                        clientId: caseData.clientId,
                        creditorName: acc.creditorName,
                        accountNumber: acc.accountNumber || null,
                        accountType: acc.accountType,
                        outstandingBalance: acc.outstandingBalance,
                        monthlyInstalment: acc.monthlyInstalment ?? null,
                        termMonths: acc.termMonths ?? null,
                        accountOpenDate: acc.accountOpenDate ? new Date(acc.accountOpenDate) : null,
                        lastPaymentDate,
                        status: acc.status,
                        isPrescribed,
                        hasInsurance: acc.hasInsurance ?? false,
                        premiumAmount: acc.premiumAmount ?? null,
                        premiumSource: 'AI_CREDIT_REPORT',
                        premiumConfidence: 'MEDIUM',
                        isIncluded: true,
                    },
                });
                created++;
            }
        }

        await prisma.workflowLog.create({
            data: {
                caseId,
                notes: `[CREDIT_ACCOUNTS_SYNCED] Synced from credit report(s): ${created} created, ${updated} updated`,
                userId: session.user.id,
            } as any,
        });

        return NextResponse.json({ created, updated });
    } catch (err: any) {
        logger.error('Failed to commit credit account sync', err);
        return NextResponse.json(
            { error: err.message || 'Failed to sync credit accounts' },
            { status: 500 }
        );
    }
}
