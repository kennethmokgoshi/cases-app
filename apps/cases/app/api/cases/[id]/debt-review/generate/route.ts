import { NextResponse } from 'next/server';
import { auth, createLogger, provisionConsumerForClient } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { z } from 'zod';

import { generateForm16, type Form16Data } from '@/lib/form16-pdf';
import { generateForm17, type Form17Data } from '@/lib/form17-pdf';
import { generateForm17W, type Form17WData } from '@/lib/form17w-pdf';
import { generateSection86Notice, type Section86Data } from '@/lib/section86-pdf';
import { generateDebtRestructuringProposal, type DebtRestructuringData } from '@/lib/debt-restructuring-pdf';
import { generateForm172A, type Form172AData } from '@/lib/form17-2a-pdf';
import { generateAffordabilityAssessment, type AffordabilityAssessmentData } from '@/lib/affordability-assessment-pdf';
import { generateConsumerInfoRecord, type ConsumerInfoRecordData } from '@/lib/consumer-info-record-pdf';
import { computeAffordabilityForCase } from '@/lib/affordability-check';
import { generateCourtDoc, type CourtDocType, type CourtDocInput } from '@zenowethu/shared-lib/src/court-docs';
import { generateForm19, type Form19Data } from '@/lib/form19-pdf';
import { generateForm172C, type Form172CData } from '@/lib/form17-2c-pdf';
import { generateSection7172Statement, type Section7172StatementData } from '@/lib/section71-72-statement-pdf';
import { findMatchingCreditProvider } from '@/lib/credit-provider-match';

const logger = createLogger('api/cases/[id]/debt-review/generate');

type RouteContext = { params: Promise<{ id: string }> };

const GenerateSchema = z.object({
    documentType: z.enum([
        'FORM_16',
        'FORM_17_1',
        'FORM_17_2A',
        'FORM_17_W',
        'SECTION_86_NOTICE',
        'DEBT_RESTRUCTURING_PROPOSAL',
        'AFFORDABILITY_ASSESSMENT',
        'CONSUMER_INFO_RECORD',
        // Status C/D3/D4 → G rescission pack (court documents)
        'NOTICE_OF_MOTION',
        'FOUNDING_AFFIDAVIT',
        'NOTICE_OF_SET_DOWN',
        'NOTICE_OF_MOTION_RESCISSION',
        'COURT_ORDER_GRANTED',
        'PROOF_OF_SERVICE',
        // Status D4 → F1/F2 packs
        'CERTIFIED_FORM_19',
        'FORM_17_2C',
        'SECTION_71_72_STATEMENT',
    ]),
    // Used by the court document types only
    courtName:       z.string().max(200).optional(),
    courtCaseNumber: z.string().max(100).optional(),
    // Used by D4 packs to decide whether Form 19 is the F1 or F2 variant.
    // 'B' is included because /clearance/evaluate recommends it for FORM_17_W
    // withdrawals outside the D3/D4 DHS statuses.
    targetStatus: z.enum(['F1', 'F2', 'G', 'B']).optional(),
});

const COURT_DOC_TYPES: ReadonlySet<string> = new Set([
    'NOTICE_OF_MOTION',
    'FOUNDING_AFFIDAVIT',
    'NOTICE_OF_SET_DOWN',
    'NOTICE_OF_MOTION_RESCISSION',
    'COURT_ORDER_GRANTED',
    'PROOF_OF_SERVICE',
]);

const DOC_FILENAMES: Record<string, string> = {
    FORM_16:                      'Form16',
    FORM_17_1:                    'Form17-1',
    FORM_17_2A:                   'Form17-2a',
    FORM_17_W:                    'Form17-W',
    SECTION_86_NOTICE:            'Section86Notice',
    DEBT_RESTRUCTURING_PROPOSAL:  'DebtRestructuringProposal',
    AFFORDABILITY_ASSESSMENT:     'AffordabilityAssessment',
    CONSUMER_INFO_RECORD:         'ConsumerInfoRecord',
    NOTICE_OF_MOTION:             'NoticeOfMotion',
    FOUNDING_AFFIDAVIT:           'FoundingAffidavit',
    NOTICE_OF_SET_DOWN:           'NoticeOfSetDown',
    NOTICE_OF_MOTION_RESCISSION:  'NoticeOfMotionRescission',
    COURT_ORDER_GRANTED:          'CourtOrderGranted',
    PROOF_OF_SERVICE:             'ProofOfService',
    CERTIFIED_FORM_19:            'Form19-ClearanceCertificate',
    FORM_17_2C:                   'Form17-2c',
    SECTION_71_72_STATEMENT:      'Section71-72-Statement',
};

/** Detect the consumer's mortgage / home loan / bond account, if any. */
const MORTGAGE_TYPE_RE = /MORTGAGE|HOME.?LOAN|BOND/i;

const SETTLED_STATUS_RE = /CLOSED|SETTLED|PAID.?UP|PAID|PRESCRIBED/i;

type DebtReviewAccount = {
    creditorName:       string;
    accountNumber:      string | null;
    accountType:        string;
    outstandingBalance: unknown;
    monthlyInstalment:  unknown;
    status:             string;
    lastPaymentDate:    Date | null;
};

function isMortgageAccount(account: DebtReviewAccount): boolean {
    return MORTGAGE_TYPE_RE.test(`${account.accountType} ${account.creditorName}`);
}

function isSettledAccount(account: DebtReviewAccount): boolean {
    return SETTLED_STATUS_RE.test(account.status) || Number(account.outstandingBalance) <= 0;
}

function toD4Account(account: DebtReviewAccount) {
    return {
        creditorName:       account.creditorName,
        accountNumber:      account.accountNumber,
        accountType:        account.accountType,
        status:             account.status,
        outstandingBalance: Number(account.outstandingBalance),
        lastPaymentDate:    account.lastPaymentDate,
    };
}

function creditReportEvidenceSource(documents: { type: string; fileName: string }[]): string | null {
    const report = documents.find(d => {
        const label = `${d.type} ${d.fileName}`.toUpperCase();
        return label.includes('CREDIT_REPORT') || label.includes('CREDIT REPORT');
    });
    return report ? `Credit report on file: ${report.fileName}` : null;
}

// POST /api/cases/[id]/debt-review/generate
// Body: { documentType: 'FORM_16' | 'FORM_17_1' | 'SECTION_86_NOTICE' | 'DEBT_RESTRUCTURING_PROPOSAL' }
export async function POST(request: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        const parsed = GenerateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid document type', issues: parsed.error.issues }, { status: 422 });
        }

        const { documentType, courtName, courtCaseNumber, targetStatus } = parsed.data;

        // ── Load case + client + credit accounts ──────────────────────────────
        const caseRecord = await prisma.case.findUnique({
            where: { id },
            include: {
                client: true,
                jointClient: { select: { firstName: true, lastName: true, idNumber: true } },
                creditAccounts: {
                    orderBy: { creditorName: 'asc' },
                    include: {
                        creditProvider: { select: { id: true, email: true, phone: true, address: true } },
                        documents: {
                            where:  { documentType: 'PAID_UP_LETTER' },
                            select: { documentType: true, uploadedAt: true, fileName: true },
                            take:   1,
                        },
                    },
                },
                documents: {
                    orderBy: { uploadedAt: 'desc' },
                    select:  { type: true, fileName: true, uploadedAt: true, extractedData: true },
                },
            },
        });
        if (!caseRecord) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        // ── Load DC settings from SystemSettings ──────────────────────────────
        const dcSettings = await prisma.systemSettings.findMany({
            where: { category: 'dc_profile' },
            select: { key: true, value: true },
        });
        const dcMap: Record<string, string> = {};
        for (const s of dcSettings) dcMap[s.key] = s.value;

        const dc = {
            ncrdc:   dcMap['dc_ncrdc_no']  || process.env.DHS_USERNAME || 'NCRDC3693',
            name:    dcMap['dc_name']       || 'Zenowethu Debt Management',
            address: dcMap['dc_address']    || 'Suite 2 Second floor Central House 17 Central Road, Mabopane, 0199, South Africa',
            phone:   dcMap['dc_phone']      || '+27817477616 / +27813109585',
            email:   dcMap['dc_email']      || 'debtreview@zenowethu.co.za',
        };

        const client = caseRecord.client;
        // Existing forms use only accounts included in the review; the affordability
        // documents consider ALL accounts on the credit report (open + closed).
        const allAccounts = caseRecord.creditAccounts;
        const accounts = allAccounts.filter(a => a.isIncluded);

        const affordability = computeAffordabilityForCase({
            creditAccounts: allAccounts.map(a => ({
                status:             a.status,
                outstandingBalance: Number(a.outstandingBalance),
                monthlyInstalment:  a.monthlyInstalment ? Number(a.monthlyInstalment) : null,
                isIncluded:         a.isIncluded,
            })),
            clientNetSalary: client.netSalary ? Number(client.netSalary) : null,
            documents:       caseRecord.documents,
        });

        const sharedAccountData = accounts.map(a => ({
            creditorName:       a.creditorName,
            accountNumber:      a.accountNumber,
            accountType:        a.accountType,
            outstandingBalance: Number(a.outstandingBalance),
            monthlyInstalment:  a.monthlyInstalment ? Number(a.monthlyInstalment) : null,
            interestRate:       a.interestRate      ? Number(a.interestRate)      : null,
            isPrescribed:       a.isPrescribed,
            isIncluded:         a.isIncluded,
        }));

        const now = new Date();

        // ── Generate PDF bytes ────────────────────────────────────────────────
        let pdfBytes: Uint8Array;

        if (COURT_DOC_TYPES.has(documentType)) {
            // Status C → G rescission pack — shared court-doc generators
            const joint = caseRecord.jointClient;
            const courtInput: CourtDocInput = {
                fileNumber:      caseRecord.fileNumber,
                courtName,
                courtCaseNumber,
                clientFullName:  `${client.firstName} ${client.lastName}`,
                clientIdNumber:  client.idNumber,
                clientAddress:   client.address ?? undefined,
                clientPhone:     client.phone   ?? undefined,
                clientEmail:     client.email   ?? undefined,
                jointClientFullName: joint ? `${joint.firstName} ${joint.lastName}` : undefined,
                jointClientIdNumber: joint?.idNumber ?? undefined,
                creditAccounts: accounts.length > 0
                    ? accounts.map(a => {
                        const paidUpDoc = a.documents[0];
                        return {
                            creditorName:       a.creditorName,
                            accountNumber:      a.accountNumber ?? undefined,
                            accountType:        a.accountType,
                            outstandingBalance: Number(a.outstandingBalance),
                            monthlyInstalment:  a.monthlyInstalment ? Number(a.monthlyInstalment) : undefined,
                            status:             a.status,
                            isPrescribed:       a.isPrescribed,
                            hasPaidUpLetter:    a.documents.length > 0 || a.status === 'CLOSED',
                            paidUpDate:         paidUpDoc?.uploadedAt?.toISOString() ?? undefined,
                            letterReference:    paidUpDoc?.fileName ?? undefined,
                        };
                      })
                    : undefined,
                generatedBy: session.user.email ?? undefined,
            };
            pdfBytes = await generateCourtDoc(documentType as CourtDocType, courtInput);
        } else if (documentType === 'FORM_16') {
            const data: Form16Data = {
                fileNumber:             caseRecord.fileNumber,
                applicationDate:        caseRecord.debtReviewDate ?? now,
                firstName:              client.firstName,
                lastName:               client.lastName,
                idNumber:               client.idNumber,
                email:                  client.email,
                phone:                  client.phone,
                address:                client.address,
                employer:               client.employer,
                employeeNo:             client.employeeNo,
                grossSalary:            client.grossSalary  ? Number(client.grossSalary)  : null,
                netSalary:              client.netSalary    ? Number(client.netSalary)    : null,
                salaryPayDate:          client.salaryPayDate ?? null,
                totalDebtAmount:        caseRecord.totalDebtAmount        ? Number(caseRecord.totalDebtAmount)        : null,
                totalMonthlyInstalment: caseRecord.totalMonthlyInstallment ? Number(caseRecord.totalMonthlyInstallment) : null,
                creditAccounts:         sharedAccountData,
                dcNcrdcNo: dc.ncrdc, dcName: dc.name, dcAddress: dc.address, dcPhone: dc.phone, dcEmail: dc.email,
            };
            pdfBytes = await generateForm16(data);
        } else if (documentType === 'FORM_17_1') {
            const data: Form17Data = {
                fileNumber:             caseRecord.fileNumber,
                notificationDate:       now,
                applicationDate:        caseRecord.debtReviewDate ?? now,
                firstName:              client.firstName,
                lastName:               client.lastName,
                idNumber:               client.idNumber,
                email:                  client.email,
                phone:                  client.phone,
                address:                client.address,
                totalDebtAmount:        caseRecord.totalDebtAmount        ? Number(caseRecord.totalDebtAmount)        : null,
                totalMonthlyInstalment: caseRecord.totalMonthlyInstallment ? Number(caseRecord.totalMonthlyInstallment) : null,
                creditAccounts:         sharedAccountData,
                dcNcrdcNo: dc.ncrdc, dcName: dc.name, dcAddress: dc.address, dcPhone: dc.phone, dcEmail: dc.email,
            };
            pdfBytes = await generateForm17(data);
        } else if (documentType === 'FORM_17_W') {
            const outstandingAccounts = allAccounts.filter(a => !isSettledAccount(a) && !isMortgageAccount(a));

            // Best-effort auto-link for accounts that predate creditor auto-matching
            // (e.g. manually entered, or synced before this matching existed) — the
            // link is persisted so future documents/emails benefit too.
            const resolvedProviders = await Promise.all(outstandingAccounts.map(async a => {
                if (a.creditProvider) return a.creditProvider;
                const matched = await findMatchingCreditProvider(prisma, a.creditorName).catch(() => null);
                if (matched) {
                    await prisma.creditAccount.update({
                        where: { id: a.id },
                        data:  { creditProviderId: matched.id },
                    }).catch(() => null);
                }
                return matched;
            }));

            const data: Form17WData = {
                fileNumber:             caseRecord.fileNumber,
                withdrawalDate:         now,
                firstName:              client.firstName,
                lastName:               client.lastName,
                idNumber:               client.idNumber,
                email:                  client.email,
                phone:                  client.phone,
                address:                client.address,
                accounts: outstandingAccounts.map((a, i) => ({
                    creditorName:   a.creditorName,
                    address:        resolvedProviders[i]?.address ?? null,
                    phone:          resolvedProviders[i]?.phone ?? null,
                    email:          resolvedProviders[i]?.email ?? null,
                    currentBalance: Number(a.outstandingBalance),
                    instalment:     a.monthlyInstalment ? Number(a.monthlyInstalment) : null,
                    interestRate:   a.interestRate ? Number(a.interestRate) : null,
                })),
                dcNcrdcNo: dc.ncrdc, dcName: dc.name, dcAddress: dc.address, dcPhone: dc.phone, dcEmail: dc.email,
                // Court-order rescission (targetStatus 'G') selects option C; the default
                // withdrawal-prior-to-Form-17.2 path (targetStatus 'B') selects option A.
                selectedOption: targetStatus === 'G' ? 'C' : 'A',
            };
            pdfBytes = await generateForm17W(data);
        } else if (documentType === 'SECTION_86_NOTICE') {
            const data: Section86Data = {
                fileNumber:      caseRecord.fileNumber,
                noticeDate:      now,
                applicationDate: caseRecord.debtReviewDate ?? now,
                firstName:       client.firstName,
                lastName:        client.lastName,
                idNumber:        client.idNumber,
                email:           client.email,
                phone:           client.phone,
                address:         client.address,
                totalDebtAmount: caseRecord.totalDebtAmount ? Number(caseRecord.totalDebtAmount) : null,
                grossSalary:     client.grossSalary ? Number(client.grossSalary) : null,
                netSalary:       client.netSalary   ? Number(client.netSalary)   : null,
                dcNcrdcNo: dc.ncrdc, dcName: dc.name, dcAddress: dc.address, dcPhone: dc.phone, dcEmail: dc.email,
            };
            pdfBytes = await generateSection86Notice(data);
        } else if (documentType === 'FORM_17_2A') {
            const data: Form172AData = {
                fileNumber:              caseRecord.fileNumber,
                rejectionDate:           now,
                applicationDate:         caseRecord.debtReviewDate ?? now,
                firstName:               client.firstName,
                lastName:                client.lastName,
                idNumber:                client.idNumber,
                email:                   client.email,
                phone:                   client.phone,
                address:                 client.address,
                openAccounts:            affordability.summary.openAccounts,
                closedAccounts:          affordability.summary.closedAccounts,
                totalOutstandingBalance: affordability.summary.totalOutstandingBalance,
                totalMonthlyInstalment:  affordability.summary.totalMonthlyInstalment,
                netIncome:               affordability.income.payslipNetIncome,
                monthlySurplus:          affordability.monthlySurplus,
                bankConfirmed:           affordability.income.bankConfirmed,
                dcNcrdcNo: dc.ncrdc, dcName: dc.name, dcAddress: dc.address, dcPhone: dc.phone, dcEmail: dc.email,
            };
            pdfBytes = await generateForm172A(data);
        } else if (documentType === 'AFFORDABILITY_ASSESSMENT') {
            const data: AffordabilityAssessmentData = {
                fileNumber:              caseRecord.fileNumber,
                assessmentDate:          now,
                firstName:               client.firstName,
                lastName:                client.lastName,
                idNumber:                client.idNumber,
                employer:                client.employer,
                grossSalary:             client.grossSalary ? Number(client.grossSalary) : null,
                netIncome:               affordability.income.payslipNetIncome,
                netIncomeSource:         affordability.income.payslipSource === 'PAYSLIP_DOCUMENT'
                                            ? 'Payslip (analysed document)'
                                            : affordability.income.payslipSource === 'CLIENT_RECORD'
                                                ? 'Client record (net salary on file)'
                                                : 'Unknown',
                bankStatementDeposit:    affordability.income.bankStatementSalaryDeposit,
                bankStatementDate:       affordability.income.bankStatementSalaryDate,
                bankConfirmed:           affordability.income.bankConfirmed,
                incomeNotes:             affordability.income.notes,
                openAccounts:            affordability.summary.openAccounts,
                closedAccounts:          affordability.summary.closedAccounts,
                totalOutstandingBalance: affordability.summary.totalOutstandingBalance,
                totalMonthlyInstalment:  affordability.summary.totalMonthlyInstalment,
                monthlySurplus:          affordability.monthlySurplus,
                isAffordable:            affordability.isAffordable,
                accounts: allAccounts.map(a => ({
                    creditorName:       a.creditorName,
                    accountNumber:      a.accountNumber,
                    accountType:        a.accountType,
                    status:             a.status,
                    outstandingBalance: Number(a.outstandingBalance),
                    monthlyInstalment:  a.monthlyInstalment ? Number(a.monthlyInstalment) : null,
                })),
                dcNcrdcNo: dc.ncrdc, dcName: dc.name, dcAddress: dc.address, dcPhone: dc.phone, dcEmail: dc.email,
            };
            pdfBytes = await generateAffordabilityAssessment(data);
        } else if (documentType === 'CONSUMER_INFO_RECORD') {
            const data: ConsumerInfoRecordData = {
                fileNumber:              caseRecord.fileNumber,
                recordDate:              now,
                applicationDate:         caseRecord.debtReviewDate ?? now,
                firstName:               client.firstName,
                lastName:                client.lastName,
                idNumber:                client.idNumber,
                email:                   client.email,
                phone:                   client.phone,
                address:                 client.address,
                employer:                client.employer,
                employeeNo:              client.employeeNo,
                grossSalary:             client.grossSalary ? Number(client.grossSalary) : null,
                netSalary:               client.netSalary   ? Number(client.netSalary)   : null,
                creditAccountCount:      allAccounts.length,
                totalOutstandingBalance: affordability.summary.totalOutstandingBalance,
                totalMonthlyInstalment:  affordability.summary.totalMonthlyInstalment,
                documents: caseRecord.documents.map(d => ({
                    type:       d.type,
                    fileName:   d.fileName,
                    uploadedAt: d.uploadedAt,
                })),
                dcNcrdcNo: dc.ncrdc, dcName: dc.name, dcAddress: dc.address, dcPhone: dc.phone, dcEmail: dc.email,
            };
            pdfBytes = await generateConsumerInfoRecord(data);
        } else if (documentType === 'CERTIFIED_FORM_19') {
            const allObligationsSettled = targetStatus !== 'F1';
            const mortgageAccount = allAccounts.find(isMortgageAccount) ?? null;
            const form19Accounts = allObligationsSettled
                ? allAccounts.map(toD4Account)
                : allAccounts.filter(a => !isMortgageAccount(a)).map(toD4Account);
            const data: Form19Data = {
                fileNumber: caseRecord.fileNumber,
                issueDate:  now,
                firstName:  client.firstName,
                lastName:   client.lastName,
                idNumber:   client.idNumber,
                address:    client.address,
                allObligationsSettled,
                mortgageCreditor: mortgageAccount?.creditorName ?? null,
                accounts: form19Accounts,
                dcNcrdcNo: dc.ncrdc, dcName: dc.name, dcAddress: dc.address, dcPhone: dc.phone, dcEmail: dc.email,
            };
            pdfBytes = await generateForm19(data);
        } else if (documentType === 'FORM_17_2C') {
            const mortgageAccount = allAccounts.find(isMortgageAccount) ?? null;
            const settledAccounts = allAccounts.filter(a => !isMortgageAccount(a) && isSettledAccount(a));
            const data: Form172CData = {
                fileNumber:       caseRecord.fileNumber,
                notificationDate: now,
                firstName:        client.firstName,
                lastName:         client.lastName,
                idNumber:         client.idNumber,
                email:            client.email,
                phone:            client.phone,
                address:          client.address,
                settledAccountCount:   settledAccounts.length,
                mortgageCreditor:      mortgageAccount?.creditorName ?? null,
                mortgageAccountNumber: mortgageAccount?.accountNumber ?? null,
                mortgageBalance:       mortgageAccount ? Number(mortgageAccount.outstandingBalance) : null,
                mortgageInstalment:    mortgageAccount?.monthlyInstalment ? Number(mortgageAccount.monthlyInstalment) : null,
                dcNcrdcNo: dc.ncrdc, dcName: dc.name, dcAddress: dc.address, dcPhone: dc.phone, dcEmail: dc.email,
            };
            pdfBytes = await generateForm172C(data);
        } else if (documentType === 'SECTION_71_72_STATEMENT') {
            const mortgageAccount = allAccounts.find(isMortgageAccount) ?? null;
            const settledAccounts = allAccounts
                .filter(a => !isMortgageAccount(a) && isSettledAccount(a))
                .map(toD4Account);
            const data: Section7172StatementData = {
                fileNumber:    caseRecord.fileNumber,
                statementDate: now,
                firstName:     client.firstName,
                lastName:      client.lastName,
                idNumber:      client.idNumber,
                address:       client.address,
                settledAccounts,
                mortgageCreditor:      mortgageAccount?.creditorName ?? null,
                mortgageAccountNumber: mortgageAccount?.accountNumber ?? null,
                mortgageBalance:       mortgageAccount ? Number(mortgageAccount.outstandingBalance) : null,
                mortgageInstalment:    mortgageAccount?.monthlyInstalment ? Number(mortgageAccount.monthlyInstalment) : null,
                mortgageEvidenceSource: creditReportEvidenceSource(caseRecord.documents),
                dcNcrdcNo: dc.ncrdc, dcName: dc.name, dcAddress: dc.address, dcPhone: dc.phone, dcEmail: dc.email,
            };
            pdfBytes = await generateSection7172Statement(data);
        } else {
            // DEBT_RESTRUCTURING_PROPOSAL
            const totalCurrent  = accounts.reduce((s, a) => s + (a.monthlyInstalment ? Number(a.monthlyInstalment) : 0), 0);
            const totalProposed = totalCurrent; // default: same as current; staff can adjust in future
            const data: DebtRestructuringData = {
                fileNumber:             caseRecord.fileNumber,
                proposalDate:           now,
                firstName:              client.firstName,
                lastName:               client.lastName,
                idNumber:               client.idNumber,
                email:                  client.email,
                phone:                  client.phone,
                address:                client.address,
                grossSalary:            client.grossSalary ? Number(client.grossSalary) : null,
                netSalary:              client.netSalary   ? Number(client.netSalary)   : null,
                livingExpenses:         null,
                totalDebtAmount:        caseRecord.totalDebtAmount        ? Number(caseRecord.totalDebtAmount) : null,
                totalCurrentInstalment: caseRecord.totalMonthlyInstallment ? Number(caseRecord.totalMonthlyInstallment) : totalCurrent,
                totalProposedInstalment: totalProposed,
                creditAccounts: sharedAccountData.map(a => ({
                    ...a,
                    currentInstalment:  a.monthlyInstalment ?? 0,
                    proposedInstalment: a.monthlyInstalment ?? 0,
                    newInterestRate:    null,
                    newTermMonths:      null,
                })),
                dcNcrdcNo: dc.ncrdc, dcName: dc.name, dcAddress: dc.address, dcPhone: dc.phone, dcEmail: dc.email,
            };
            pdfBytes = await generateDebtRestructuringProposal(data);
        }

        // ── Save to disk ──────────────────────────────────────────────────────
        const publicUploadDir = path.join(process.cwd(), 'public', 'uploads', 'debt-review', id);
        const storageUploadDir = path.join(process.cwd(), 'storage', 'uploads', 'debt-review', id);
        if (!existsSync(publicUploadDir)) {
            await mkdir(publicUploadDir, { recursive: true });
        }
        if (!existsSync(storageUploadDir)) {
            await mkdir(storageUploadDir, { recursive: true });
        }

        const dateStr  = now.toISOString().slice(0, 10);
        const baseName = DOC_FILENAMES[documentType];
        const safeFileNumber = (caseRecord.fileNumber || 'Unknown').replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `${baseName}_${safeFileNumber}_${dateStr}.pdf`;

        await writeFile(path.join(publicUploadDir, fileName), pdfBytes);
        await writeFile(path.join(storageUploadDir, fileName), pdfBytes).catch(() => null);
        const publicUrl = `/uploads/debt-review/${id}/${fileName}`;

        // ── Upsert DebtReviewDocument record ──────────────────────────────────
        const existing = await prisma.debtReviewDocument.findFirst({
            where: { caseId: id, documentType },
        });

        const docRecord = existing
            ? await prisma.debtReviewDocument.update({
                where: { id: existing.id },
                data:  { fileUrl: publicUrl, status: 'DRAFT', updatedAt: now },
              })
            : await prisma.debtReviewDocument.create({
                data: {
                    caseId:       id,
                    documentType,
                    fileUrl:      publicUrl,
                    status:       'DRAFT',
                },
              });

        // ── Sync to Consumer Profile Vault (Document table - Quote-style Upload) ──
        // Save clearance PDF to vault with isAdminOnly: false so all staff can view and manage it.
        const isB2B = caseRecord.acquisitionType === 'B2B';
        const existingVaultDoc = await prisma.document.findFirst({
            where: { caseId: id, type: documentType },
        });

        if (existingVaultDoc) {
            await prisma.document.update({
                where: { id: existingVaultDoc.id },
                data: {
                    fileName,
                    fileUrl: publicUrl,
                    fileSize: pdfBytes.length,
                    uploadedAt: now,
                    isAdminOnly: false,
                },
            });
        } else {
            await prisma.document.create({
                data: {
                    caseId: id,
                    type: documentType,
                    fileName,
                    fileUrl: publicUrl,
                    fileSize: pdfBytes.length,
                    mimeType: 'application/pdf',
                    uploadedById: session.user.id,
                    isAdminOnly: false,
                },
            });
        }

        // ── Sync to Crediva Consumer Profile (CredoDocument table) ────────────────
        // For B2C consumers, also sync to CredoDocument so the clearance certificate
        // loads on the consumer's profile in the Crediva portal.
        if (!isB2B && caseRecord.clientId) {
            try {
                const provision = await provisionConsumerForClient(caseRecord.clientId).catch(() => null);
                const consumerId = provision?.consumerId || (await prisma.case.findUnique({
                    where: { id },
                    select: { client: { select: { consumerAccount: { select: { id: true } } } } },
                }))?.client?.consumerAccount?.id;

                if (consumerId) {
                    const storagePath = path.join(publicUploadDir, fileName);
                    const existingCredoDoc = await prisma.credoDocument.findFirst({
                        where: { consumerId, originalName: fileName },
                    });

                    if (existingCredoDoc) {
                        await prisma.credoDocument.update({
                            where: { id: existingCredoDoc.id },
                            data: {
                                fileName,
                                originalName: fileName,
                                mimeType: 'application/pdf',
                                size: pdfBytes.length,
                                storagePath,
                                category: 'CLEARANCE',
                                createdAt: now,
                            },
                        });
                    } else {
                        await prisma.credoDocument.create({
                            data: {
                                consumerId,
                                fileName,
                                originalName: fileName,
                                mimeType: 'application/pdf',
                                size: pdfBytes.length,
                                storagePath,
                                category: 'CLEARANCE',
                                createdAt: now,
                            },
                        });
                    }
                }
            } catch (credoErr) {
                logger.warn('Failed to sync clearance to Crediva Consumer Profile:', credoErr);
            }
        }

        logger.info(`Generated ${documentType} for case ${id} by user ${session.user.id}: ${publicUrl} (isB2B=${isB2B})`);

        return NextResponse.json({ success: true, document: docRecord, url: publicUrl, isB2B }, { status: 201 });
    } catch (error) {
        logger.error('Error generating debt review document:', error);
        return NextResponse.json({ error: 'Failed to generate document' }, { status: 500 });
    }
}
