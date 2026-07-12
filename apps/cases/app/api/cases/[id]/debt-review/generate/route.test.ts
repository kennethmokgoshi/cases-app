import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/shared-lib/src/court-docs', () => ({
    generateCourtDoc: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn() },
        systemSettings: { findMany: vi.fn() },
        debtReviewDocument: {
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
    },
}));

vi.mock('fs', () => ({ existsSync: vi.fn() }));
vi.mock('fs/promises', () => ({ mkdir: vi.fn(), writeFile: vi.fn() }));

vi.mock('@/lib/form16-pdf', () => ({ generateForm16: vi.fn() }));
vi.mock('@/lib/form17-pdf', () => ({ generateForm17: vi.fn() }));
vi.mock('@/lib/form17w-pdf', () => ({ generateForm17W: vi.fn() }));
vi.mock('@/lib/section86-pdf', () => ({ generateSection86Notice: vi.fn() }));
vi.mock('@/lib/debt-restructuring-pdf', () => ({ generateDebtRestructuringProposal: vi.fn() }));
vi.mock('@/lib/form17-2a-pdf', () => ({ generateForm172A: vi.fn() }));
vi.mock('@/lib/affordability-assessment-pdf', () => ({ generateAffordabilityAssessment: vi.fn() }));
vi.mock('@/lib/consumer-info-record-pdf', () => ({ generateConsumerInfoRecord: vi.fn() }));
vi.mock('@/lib/form19-pdf', () => ({ generateForm19: vi.fn() }));
vi.mock('@/lib/form17-2c-pdf', () => ({ generateForm172C: vi.fn() }));
vi.mock('@/lib/section71-72-statement-pdf', () => ({ generateSection7172Statement: vi.fn() }));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';

import { generateForm19 } from '@/lib/form19-pdf';
import { generateForm172C } from '@/lib/form17-2c-pdf';
import { generateSection7172Statement } from '@/lib/section71-72-statement-pdf';

import { POST } from './route';

const session = { user: { id: 'user-1', email: 'staff@example.com' } };

const caseRecord = {
    id: 'case-1',
    fileNumber: 'ZW-0001',
    debtReviewDate: new Date('2026-01-10'),
    totalDebtAmount: 500000,
    totalMonthlyInstallment: 8000,
    client: {
        firstName: 'Thabo',
        lastName: 'Mokoena',
        idNumber: '8001015009087',
        email: 'thabo@example.com',
        phone: '0821234567',
        address: '12 Example Street',
        employer: 'Example Employer',
        employeeNo: 'EMP1',
        grossSalary: 25000,
        netSalary: 18000,
        salaryPayDate: 25,
    },
    jointClient: null,
    creditAccounts: [
        {
            creditorName: 'Standard Bank Home Loans',
            accountNumber: 'HL-998877',
            accountType: 'MORTGAGE_LOAN',
            outstandingBalance: 450000,
            monthlyInstalment: 5200,
            interestRate: 11,
            isPrescribed: false,
            isIncluded: true,
            status: 'ACTIVE',
            creditProvider: null,
            documents: [],
        },
        {
            creditorName: 'ABSA Bank',
            accountNumber: '123456',
            accountType: 'PERSONAL_LOAN',
            outstandingBalance: 0,
            monthlyInstalment: 0,
            interestRate: 0,
            isPrescribed: false,
            isIncluded: true,
            status: 'CLOSED',
            creditProvider: null,
            documents: [{ documentType: 'PAID_UP_LETTER', uploadedAt: new Date('2026-06-01'), fileName: 'absa-paid-up.pdf' }],
        },
    ],
    documents: [
        { type: 'CREDIT_REPORT_XDS', fileName: 'xds-credit-report.pdf', uploadedAt: new Date('2026-06-20'), extractedData: null },
        { type: 'PAYSLIP', fileName: 'payslip.pdf', uploadedAt: new Date('2026-06-21'), extractedData: JSON.stringify({ netSalary: 18000 }) },
        {
            type: 'BANK_STATEMENT',
            fileName: 'bank-statement.pdf',
            uploadedAt: new Date('2026-06-22'),
            extractedData: JSON.stringify({ latestSalaryDeposit: { amount: 18000, date: '2026-06-25' } }),
        },
    ],
};

function ctx(caseId: string) {
    return { params: Promise.resolve({ id: caseId }) };
}

function req(documentType: string, extra: Record<string, string> = {}) {
    return new Request('http://localhost/api/cases/case-1/debt-review/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentType, ...extra }),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(session as never);
    vi.mocked(prisma.case.findUnique).mockResolvedValue(caseRecord as never);
    vi.mocked(prisma.systemSettings.findMany).mockResolvedValue([]);
    vi.mocked(prisma.debtReviewDocument.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.debtReviewDocument.create).mockResolvedValue({ id: 'doc-1', fileUrl: '/uploads/debt-review/case-1/test.pdf' } as never);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(generateForm19).mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    vi.mocked(generateForm172C).mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    vi.mocked(generateSection7172Statement).mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
});

describe('POST /api/cases/[id]/debt-review/generate D4 documents', () => {
    it('generates the F1 Certified Form 19 variant when targetStatus is F1', async () => {
        const res = await POST(req('CERTIFIED_FORM_19', { targetStatus: 'F1' }), ctx('case-1'));

        expect(res.status).toBe(201);
        expect(generateForm19).toHaveBeenCalledWith(expect.objectContaining({
            allObligationsSettled: false,
            mortgageCreditor: 'Standard Bank Home Loans',
            accounts: [expect.objectContaining({ creditorName: 'ABSA Bank' })],
        }));
    });

    it('generates the F2 Certified Form 19 variant when targetStatus is F2', async () => {
        const res = await POST(req('CERTIFIED_FORM_19', { targetStatus: 'F2' }), ctx('case-1'));

        expect(res.status).toBe(201);
        expect(generateForm19).toHaveBeenCalledWith(expect.objectContaining({
            allObligationsSettled: true,
            accounts: expect.arrayContaining([
                expect.objectContaining({ creditorName: 'Standard Bank Home Loans' }),
                expect.objectContaining({ creditorName: 'ABSA Bank' }),
            ]),
        }));
    });

    it('generates Form 17.2(c) with the remaining mortgage details', async () => {
        const res = await POST(req('FORM_17_2C'), ctx('case-1'));

        expect(res.status).toBe(201);
        expect(generateForm172C).toHaveBeenCalledWith(expect.objectContaining({
            settledAccountCount: 1,
            mortgageCreditor: 'Standard Bank Home Loans',
            mortgageAccountNumber: 'HL-998877',
            mortgageBalance: 450000,
            mortgageInstalment: 5200,
        }));
    });

    it('generates the sections 71 and 72 statement with credit-report mortgage evidence', async () => {
        const res = await POST(req('SECTION_71_72_STATEMENT'), ctx('case-1'));

        expect(res.status).toBe(201);
        expect(generateSection7172Statement).toHaveBeenCalledWith(expect.objectContaining({
            mortgageCreditor: 'Standard Bank Home Loans',
            mortgageEvidenceSource: 'Credit report on file: xds-credit-report.pdf',
            settledAccounts: [expect.objectContaining({ creditorName: 'ABSA Bank' })],
        }));
    });
});
