import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { z } from 'zod';

import { generateForm16, type Form16Data } from '@/lib/form16-pdf';
import { generateForm17, type Form17Data } from '@/lib/form17-pdf';
import { generateSection86Notice, type Section86Data } from '@/lib/section86-pdf';
import { generateDebtRestructuringProposal, type DebtRestructuringData } from '@/lib/debt-restructuring-pdf';

const logger = createLogger('api/cases/[id]/debt-review/generate');

type RouteContext = { params: Promise<{ id: string }> };

const GenerateSchema = z.object({
    documentType: z.enum([
        'FORM_16',
        'FORM_17_1',
        'SECTION_86_NOTICE',
        'DEBT_RESTRUCTURING_PROPOSAL',
    ]),
});

const DOC_FILENAMES: Record<string, string> = {
    FORM_16:                      'Form16',
    FORM_17_1:                    'Form17-1',
    SECTION_86_NOTICE:            'Section86Notice',
    DEBT_RESTRUCTURING_PROPOSAL:  'DebtRestructuringProposal',
};

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

        const { documentType } = parsed.data;

        // ── Load case + client + credit accounts ──────────────────────────────
        const caseRecord = await prisma.case.findUnique({
            where: { id },
            include: {
                client: true,
                creditAccounts: {
                    where:   { isIncluded: true },
                    orderBy: { creditorName: 'asc' },
                    include: { creditProvider: { select: { id: true, email: true } } },
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
            ncrdc:   dcMap['dc_ncrdc_no']  || process.env.DHS_USERNAME || 'NCRDC____',
            name:    dcMap['dc_name']       || 'Zenowethu Debt Counsellor',
            address: dcMap['dc_address']    || '—',
            phone:   dcMap['dc_phone']      || '—',
            email:   dcMap['dc_email']      || '—',
        };

        const client = caseRecord.client;
        const accounts = caseRecord.creditAccounts;

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

        if (documentType === 'FORM_16') {
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
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'debt-review', id);
        if (!existsSync(uploadDir)) {
            await mkdir(uploadDir, { recursive: true });
        }

        const dateStr  = now.toISOString().slice(0, 10);
        const baseName = DOC_FILENAMES[documentType];
        const fileName = `${baseName}_${caseRecord.fileNumber}_${dateStr}.pdf`;
        const filePath = path.join(uploadDir, fileName);

        await writeFile(filePath, pdfBytes);
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

        logger.info(`Generated ${documentType} for case ${id} by user ${session.user.id}: ${publicUrl}`);

        return NextResponse.json({ success: true, document: docRecord, url: publicUrl }, { status: 201 });
    } catch (error) {
        logger.error('Error generating debt review document:', error);
        return NextResponse.json({ error: 'Failed to generate document' }, { status: 500 });
    }
}
