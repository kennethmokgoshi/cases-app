import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

import {
    computeAffordabilityForCase,
    D4_F1_GENERATED_DOCUMENTS,
    D4_F2_GENERATED_DOCUMENTS,
    isDhsStatusA,
    isDhsStatusC,
    isDhsStatusD3,
    isDhsStatusD4,
    listOpenCreditAccounts,
    RESCISSION_PACK_DOCUMENTS,
} from '@/lib/affordability-check';

const logger = createLogger('api/cases/[id]/affordability-check');

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/cases/[id]/affordability-check
// Summarises the credit report (open/closed accounts, balances, instalments),
// verifies net income (payslip vs bank statement salary deposit) and returns
// the affordability verdict + DHS Status A rejection-pack recommendation.
export async function GET(_req: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const caseRecord = await prisma.case.findUnique({
            where: { id },
            select: {
                id:         true,
                fileNumber: true,
                dhsStatus:  true,
                client:     { select: { netSalary: true } },
                creditAccounts: {
                    select: {
                        status:             true,
                        id:                 true,
                        creditorName:       true,
                        accountNumber:      true,
                        accountType:        true,
                        accountOpenDate:    true,
                        outstandingBalance: true,
                        monthlyInstalment:  true,
                        isIncluded:         true,
                        lastPaymentDate:    true,
                        updatedAt:          true,
                        creditProvider:     { select: { name: true } },
                    },
                },
                documents: {
                    where:   { type: { in: ['PAYSLIP', 'BANK_STATEMENT'] } },
                    orderBy: { uploadedAt: 'desc' },
                    select:  { type: true, extractedData: true },
                },
            },
        });
        if (!caseRecord) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        const result = computeAffordabilityForCase({
            creditAccounts: caseRecord.creditAccounts.map(a => ({
                status:             a.status,
                outstandingBalance: Number(a.outstandingBalance),
                monthlyInstalment:  a.monthlyInstalment ? Number(a.monthlyInstalment) : null,
                isIncluded:         a.isIncluded,
            })),
            clientNetSalary: caseRecord.client.netSalary ? Number(caseRecord.client.netSalary) : null,
            documents:       caseRecord.documents,
        });

        const statusC  = isDhsStatusC(caseRecord.dhsStatus);
        const statusD3 = isDhsStatusD3(caseRecord.dhsStatus);
        const statusD4 = isDhsStatusD4(caseRecord.dhsStatus);
        const openAccountRows = listOpenCreditAccounts(caseRecord.creditAccounts.map(a => ({
            id:                 a.id,
            creditorName:       a.creditorName,
            providerName:       a.creditProvider?.name ?? null,
            accountNumber:      a.accountNumber,
            accountType:        a.accountType,
            accountOpenDate:    a.accountOpenDate,
            status:             a.status,
            outstandingBalance: Number(a.outstandingBalance),
            monthlyInstalment:  a.monthlyInstalment ? Number(a.monthlyInstalment) : null,
            isIncluded:         a.isIncluded,
            lastPaymentDate:    a.lastPaymentDate,
            updatedAt:          a.updatedAt,
        })));

        return NextResponse.json({
            caseId:        caseRecord.id,
            fileNumber:    caseRecord.fileNumber,
            dhsStatus:     caseRecord.dhsStatus,
            isDhsStatusA:  isDhsStatusA(caseRecord.dhsStatus),
            // Status C → the exit path is a court order rescission to Status G,
            // filed with the six-document rescission pack.
            isDhsStatusC:  statusC,
            isDhsStatusD3: statusD3,
            isDhsStatusD4: statusD4,
            rescissionDocuments: statusC || statusD3 || statusD4 ? [...RESCISSION_PACK_DOCUMENTS] : [],
            d4F1GeneratedDocuments: statusD4 ? [...D4_F1_GENERATED_DOCUMENTS] : [],
            d4F2GeneratedDocuments: statusD4 ? [...D4_F2_GENERATED_DOCUMENTS] : [],
            openAccountRows,
            ...result,
        });
    } catch (error) {
        logger.error('Error running affordability check:', error);
        return NextResponse.json({ error: 'Failed to run affordability check' }, { status: 500 });
    }
}
