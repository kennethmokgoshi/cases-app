import { describe, it, expect } from 'vitest';
import {
    summariseCreditReport,
    parsePayslipNetIncome,
    parseBankSalaryDeposit,
    verifyIncome,
    computeAffordability,
    listOpenCreditAccounts,
    isDhsStatusA,
    isDhsStatusC,
    isDhsStatusD3,
    isDhsStatusD4,
    D4_F1_GENERATED_DOCUMENTS,
    D4_F2_GENERATED_DOCUMENTS,
    REJECTION_PACK_DOCUMENTS,
    RESCISSION_PACK_DOCUMENTS,
    type AffordabilityAccountInput,
} from './affordability-check';

const acc = (over: Partial<AffordabilityAccountInput> = {}): AffordabilityAccountInput => ({
    status: 'ACTIVE',
    outstandingBalance: 10000,
    monthlyInstalment: 500,
    isIncluded: true,
    ...over,
});

describe('summariseCreditReport', () => {
    it('counts open vs closed accounts and totals only open ones', () => {
        const summary = summariseCreditReport([
            acc({ outstandingBalance: 12000, monthlyInstalment: 800 }),
            acc({ outstandingBalance: 8000,  monthlyInstalment: 450.5 }),
            acc({ status: 'CLOSED',      outstandingBalance: 5000, monthlyInstalment: 300 }),
            acc({ status: 'SETTLED',     outstandingBalance: 2000, monthlyInstalment: 100 }),
            acc({ status: 'WRITTEN_OFF', outstandingBalance: 999,  monthlyInstalment: 50 }),
        ]);
        expect(summary.openAccounts).toBe(2);
        expect(summary.closedAccounts).toBe(3);
        expect(summary.totalOutstandingBalance).toBe(20000);
        expect(summary.totalMonthlyInstalment).toBe(1250.5);
    });

    it('handles null instalments and empty input', () => {
        expect(summariseCreditReport([]).openAccounts).toBe(0);
        const summary = summariseCreditReport([acc({ monthlyInstalment: null })]);
        expect(summary.totalMonthlyInstalment).toBe(0);
        expect(summary.openAccounts).toBe(1);
    });
});

describe('listOpenCreditAccounts', () => {
    it('lists only open accounts with the credit-report fields needed by staff', () => {
        const rows = listOpenCreditAccounts([
            {
                ...acc({ outstandingBalance: 12345.678, monthlyInstalment: 987.654 }),
                id: 'acc-1',
                creditorName: 'ABSA Bank',
                providerName: 'ABSA',
                accountNumber: '123',
                accountType: 'PERSONAL_LOAN',
                accountOpenDate: new Date('2020-01-15T00:00:00.000Z'),
                lastPaymentDate: '2026-06-25T00:00:00.000Z',
                updatedAt: '2026-07-01T10:30:00.000Z',
            },
            {
                ...acc({ status: 'CLOSED', outstandingBalance: 0, monthlyInstalment: null }),
                id: 'acc-2',
                creditorName: 'Closed Store',
                providerName: null,
                accountNumber: 'CLOSED',
                accountType: 'RETAIL',
                accountOpenDate: null,
                lastPaymentDate: null,
                updatedAt: '2026-07-01T10:30:00.000Z',
            },
        ]);

        expect(rows).toEqual([
            {
                id: 'acc-1',
                creditorName: 'ABSA Bank',
                providerName: 'ABSA',
                accountNumber: '123',
                accountType: 'PERSONAL_LOAN',
                openDate: '2020-01-15T00:00:00.000Z',
                balance: 12345.68,
                monthlyInstalment: 987.65,
                lastPaymentDate: '2026-06-25T00:00:00.000Z',
                lastUpdate: '2026-07-01T10:30:00.000Z',
            },
        ]);
    });
});

describe('extraction parsing', () => {
    it('parses net salary from payslip extractedData', () => {
        expect(parsePayslipNetIncome(JSON.stringify({ netSalary: 15500.75 }))).toBe(15500.75);
    });

    it('returns null for missing, zero, NA or malformed payslip data', () => {
        expect(parsePayslipNetIncome(null)).toBeNull();
        expect(parsePayslipNetIncome('not json')).toBeNull();
        expect(parsePayslipNetIncome(JSON.stringify({ netSalary: 0 }))).toBeNull();
        expect(parsePayslipNetIncome(JSON.stringify({ netSalary: 'NA' }))).toBeNull();
    });

    it('parses the latest salary deposit from bank statement extractedData', () => {
        const raw = JSON.stringify({ latestSalaryDeposit: { amount: 15400, date: '2026-06-25' } });
        expect(parseBankSalaryDeposit(raw)).toEqual({ amount: 15400, date: '2026-06-25' });
    });

    it('returns null when the deposit is absent or zero', () => {
        expect(parseBankSalaryDeposit(JSON.stringify({}))).toBeNull();
        expect(parseBankSalaryDeposit(JSON.stringify({ latestSalaryDeposit: { amount: 0 } }))).toBeNull();
    });
});

describe('verifyIncome', () => {
    it('confirms income when bank deposit matches payslip within tolerance', () => {
        const v = verifyIncome({
            clientNetSalary: null,
            payslipNetIncome: 15000,
            bankSalaryDeposit: 14950,
            bankSalaryDate: '2026-06-25',
        });
        expect(v.bankConfirmed).toBe(true);
        expect(v.varianceAmount).toBe(50);
        expect(v.payslipSource).toBe('PAYSLIP_DOCUMENT');
    });

    it('does not confirm when the deposit differs beyond tolerance', () => {
        const v = verifyIncome({
            clientNetSalary: null,
            payslipNetIncome: 15000,
            bankSalaryDeposit: 9000,
            bankSalaryDate: null,
        });
        expect(v.bankConfirmed).toBe(false);
    });

    it('falls back to the client record net salary when no payslip document exists', () => {
        const v = verifyIncome({
            clientNetSalary: 12000,
            payslipNetIncome: null,
            bankSalaryDeposit: 12010,
            bankSalaryDate: null,
        });
        expect(v.payslipNetIncome).toBe(12000);
        expect(v.payslipSource).toBe('CLIENT_RECORD');
        expect(v.bankConfirmed).toBe(true);
    });
});

describe('computeAffordability', () => {
    const affordableIncome = {
        clientNetSalary: null,
        payslipNetIncome: 20000,
        bankSalaryDeposit: 19980,
        bankSalaryDate: '2026-06-25',
    };

    it('recommends rejection when instalments < confirmed net income', () => {
        const result = computeAffordability(
            [acc({ monthlyInstalment: 3000 }), acc({ monthlyInstalment: 2500 })],
            affordableIncome
        );
        expect(result.isAffordable).toBe(true);
        expect(result.monthlySurplus).toBe(14500);
        expect(result.rejectionRecommended).toBe(true);
        expect(result.requiredDocuments).toEqual([...REJECTION_PACK_DOCUMENTS]);
    });

    it('does not recommend rejection when instalments exceed net income', () => {
        const result = computeAffordability(
            [acc({ monthlyInstalment: 25000 })],
            affordableIncome
        );
        expect(result.isAffordable).toBe(false);
        expect(result.rejectionRecommended).toBe(false);
        expect(result.requiredDocuments).toEqual([]);
    });

    it('does not recommend rejection when income is not bank-confirmed', () => {
        const result = computeAffordability(
            [acc({ monthlyInstalment: 3000 })],
            { ...affordableIncome, bankSalaryDeposit: 5000 }
        );
        expect(result.isAffordable).toBe(true);
        expect(result.rejectionRecommended).toBe(false);
    });

    it('returns null verdict when income is unknown', () => {
        const result = computeAffordability(
            [acc()],
            { clientNetSalary: null, payslipNetIncome: null, bankSalaryDeposit: null, bankSalaryDate: null }
        );
        expect(result.isAffordable).toBeNull();
        expect(result.monthlySurplus).toBeNull();
        expect(result.rejectionRecommended).toBe(false);
    });
});

describe('isDhsStatusA', () => {
    it('matches code A in raw and labelled forms', () => {
        expect(isDhsStatusA('A')).toBe(true);
        expect(isDhsStatusA(' a ')).toBe(true);
        expect(isDhsStatusA('A - Application in process')).toBe(true);
        expect(isDhsStatusA('A: Debt review application')).toBe(true);
    });

    it('never matches A1 or other codes', () => {
        expect(isDhsStatusA('A1')).toBe(false);
        expect(isDhsStatusA('B')).toBe(false);
        expect(isDhsStatusA('Accepted')).toBe(false);
        expect(isDhsStatusA(null)).toBe(false);
        expect(isDhsStatusA(undefined)).toBe(false);
    });
});

describe('isDhsStatusC', () => {
    it('matches code C in raw and labelled forms', () => {
        expect(isDhsStatusC('C')).toBe(true);
        expect(isDhsStatusC(' c ')).toBe(true);
        expect(isDhsStatusC('C - Under debt review')).toBe(true);
        expect(isDhsStatusC('C: Debt review, no court order')).toBe(true);
    });

    it('never matches other codes or C-word labels', () => {
        expect(isDhsStatusC('C1')).toBe(false);
        expect(isDhsStatusC('A')).toBe(false);
        expect(isDhsStatusC('Completed')).toBe(false);
        expect(isDhsStatusC(null)).toBe(false);
        expect(isDhsStatusC(undefined)).toBe(false);
    });
});

describe('DHS D3/D4 status helpers', () => {
    it('matches D3 and D4 codes in raw and labelled forms', () => {
        expect(isDhsStatusD3('D3')).toBe(true);
        expect(isDhsStatusD3('D3 - Consent order')).toBe(true);
        expect(isDhsStatusD4('D4')).toBe(true);
        expect(isDhsStatusD4('D4: Magistrate court order')).toBe(true);
    });

    it('does not confuse D3 and D4 with other statuses', () => {
        expect(isDhsStatusD3('D4')).toBe(false);
        expect(isDhsStatusD4('D3')).toBe(false);
        expect(isDhsStatusD4(null)).toBe(false);
    });
});

describe('RESCISSION_PACK_DOCUMENTS', () => {
    it('contains the six court documents for the C → G path', () => {
        expect(RESCISSION_PACK_DOCUMENTS).toEqual([
            'NOTICE_OF_MOTION',
            'FOUNDING_AFFIDAVIT',
            'NOTICE_OF_SET_DOWN',
            'NOTICE_OF_MOTION_RESCISSION',
            'COURT_ORDER_GRANTED',
            'PROOF_OF_SERVICE',
        ]);
    });
});

describe('D4 generated packs', () => {
    it('contains the generated documents for D4 to F1 and D4 to F2', () => {
        expect(D4_F1_GENERATED_DOCUMENTS).toEqual([
            'CERTIFIED_FORM_19',
            'FORM_17_2C',
            'DEBT_RESTRUCTURING_PROPOSAL',
            'SECTION_71_72_STATEMENT',
        ]);
        expect(D4_F2_GENERATED_DOCUMENTS).toEqual(['CERTIFIED_FORM_19']);
    });
});
