import { describe, expect, it } from 'vitest';
import { buildCreditReportInsights } from './credit-report-insights';

function yearsAgo(years: number): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    return d.toISOString().slice(0, 10);
}

describe('buildCreditReportInsights — dispute candidates', () => {
    it('flags an ordinary adverse listing with no payment in 3+ years as a prescription candidate', () => {
        const insights = buildCreditReportInsights({
            adverseListings: [{ creditor: 'Lewis Stores', accountNumber: '123', adverseCode: 'Written Off', lastPaymentDate: yearsAgo(4) }],
        });
        const item = insights.find(i => i.category === 'dispute' && i.title.includes('prescription'));
        expect(item).toBeDefined();
        expect(item?.detail).toContain('Prescription Act');
    });

    it('does not flag an adverse listing with a payment less than 3 years ago', () => {
        const insights = buildCreditReportInsights({
            adverseListings: [{ creditor: 'Lewis Stores', accountNumber: '123', lastPaymentDate: yearsAgo(1) }],
        });
        expect(insights.find(i => i.title.includes('prescription'))).toBeUndefined();
    });

    it('uses the 30-year judgment prescription threshold instead of 3 years for judgment debt', () => {
        const notYetJudgment = buildCreditReportInsights({
            adverseListings: [{ creditor: 'ABC Attorneys', accountNumber: '1', adverseCode: 'Judgment', lastPaymentDate: yearsAgo(5) }],
        });
        expect(notYetJudgment.find(i => i.title.includes('prescription'))).toBeUndefined();

        const oldJudgment = buildCreditReportInsights({
            adverseListings: [{ creditor: 'ABC Attorneys', accountNumber: '1', adverseCode: 'Judgment', lastPaymentDate: yearsAgo(31) }],
        });
        const item = oldJudgment.find(i => i.title.includes('prescription'));
        expect(item).toBeDefined();
        expect(item?.detail).toContain('judgment');
    });

    it('flags a duplicate account number appearing more than once', () => {
        const insights = buildCreditReportInsights({
            accounts: [
                { creditor: 'African Bank', accountNumber: '999' },
                { creditor: 'African Bank', accountNumber: '999' },
            ],
        });
        expect(insights.find(i => i.category === 'dispute' && i.title.includes('Duplicate'))).toBeDefined();
    });

    it('flags inconsistent ID number occurrences', () => {
        const insights = buildCreditReportInsights({
            _occurrences: { idNumber: [{ value: '8908305317089', count: 1 }, { value: '8908035317089', count: 1 }] },
        });
        expect(insights.find(i => i.category === 'dispute' && i.title.includes('ID number'))).toBeDefined();
    });

    it('flags excessive enquiries', () => {
        const insights = buildCreditReportInsights({
            enquirySummary: { totalLast12Months: 9, excessiveFlag: true },
        });
        expect(insights.find(i => i.category === 'dispute' && i.title.includes('enquiries'))).toBeDefined();
    });
});

describe('buildCreditReportInsights — adverse listing visibility', () => {
    it('surfaces a non-prescribed adverse listing as an info item so it is never silently hidden', () => {
        const insights = buildCreditReportInsights({
            adverseListings: [{ creditor: 'LEWIS STORES', accountNumber: '0903150', adverseCode: 'Written Off', openBalance: 33330, status: 'WRITTEN OFF', lastPaymentDate: yearsAgo(2) }],
        });
        const item = insights.find(i => i.category === 'info' && i.title.includes('LEWIS STORES'));
        expect(item).toBeDefined();
        expect(item?.detail).toContain(`R${new Intl.NumberFormat('en-ZA').format(33330)}`);
        expect(item?.detail).toContain('not yet prescription-eligible');
    });

    it('does not duplicate an adverse listing as both a dispute candidate and an info item', () => {
        const insights = buildCreditReportInsights({
            adverseListings: [{ creditor: 'Old Debt Co', accountNumber: '1', lastPaymentDate: yearsAgo(4) }],
        });
        const infoItems = insights.filter(i => i.category === 'info' && i.title.includes('Old Debt Co'));
        const disputeItems = insights.filter(i => i.category === 'dispute' && i.title.includes('Old Debt Co'));
        expect(disputeItems).toHaveLength(1);
        expect(infoItems).toHaveLength(0);
    });
});

describe('buildCreditReportInsights — improve candidates', () => {
    it('surfaces each credit score suppressor', () => {
        const insights = buildCreditReportInsights({
            creditScore: { score: 500, band: 'Below Average', suppressors: ['High utilisation', 'Recent enquiries'] },
        });
        const items = insights.filter(i => i.category === 'improve' && i.title === 'Credit score suppressor');
        expect(items).toHaveLength(2);
    });

    it('flags an account with arrears', () => {
        const insights = buildCreditReportInsights({
            accounts: [{ creditor: 'Capfin', arrearsAmount: 500 }],
        });
        expect(insights.find(i => i.category === 'improve' && i.title.includes('arrears'))).toBeDefined();
    });

    it('flags a high debt-to-income ratio and points to the full Affordability Check', () => {
        const insights = buildCreditReportInsights({
            income: { netSalary: 10000 },
            summary: { totalInstallment: 5000 },
        });
        const item = insights.find(i => i.category === 'improve' && i.title.includes('debt-to-income'));
        expect(item).toBeDefined();
        expect(item?.detail).toContain('Affordability Check');
    });

    it('does not flag debt-to-income when the ratio is low', () => {
        const insights = buildCreditReportInsights({
            income: { netSalary: 10000 },
            summary: { totalInstallment: 1000 },
        });
        expect(insights.find(i => i.title.includes('debt-to-income'))).toBeUndefined();
    });
});

describe('buildCreditReportInsights — positive signals', () => {
    it('flags no adverse listings as positive', () => {
        const insights = buildCreditReportInsights({ adverseListings: [] });
        expect(insights.find(i => i.category === 'positive' && i.title.includes('No adverse'))).toBeDefined();
    });

    it('flags a Good or Great score band as positive', () => {
        const insights = buildCreditReportInsights({ creditScore: { score: 700, band: 'Good' } });
        expect(insights.find(i => i.category === 'positive' && i.title.includes('Good credit score'))).toBeDefined();
    });

    it('flags non-excessive enquiries as positive', () => {
        const insights = buildCreditReportInsights({ enquirySummary: { totalLast12Months: 1, excessiveFlag: false } });
        expect(insights.find(i => i.category === 'positive' && i.title.includes('normal range'))).toBeDefined();
    });

    it('flags consistent identity data as positive when there is no conflict', () => {
        const insights = buildCreditReportInsights({ _occurrences: { idNumber: [{ value: '123', count: 3 }] } });
        expect(insights.find(i => i.category === 'positive' && i.title.includes('Consistent identity'))).toBeDefined();
    });

    it('does not flag consistent identity data as positive when there is a conflict', () => {
        const insights = buildCreditReportInsights({
            _occurrences: { idNumber: [{ value: '123', count: 1 }, { value: '456', count: 1 }] },
        });
        expect(insights.find(i => i.category === 'positive' && i.title.includes('Consistent identity'))).toBeUndefined();
    });
});

describe('buildCreditReportInsights — informational context', () => {
    it('flags registration under a different debt counsellor', () => {
        const insights = buildCreditReportInsights({
            debtRestructuring: { ncrdcNo: 'NCRDC2967', debtCounsellorName: 'Semar Muhammad' },
        });
        const item = insights.find(i => i.category === 'info' && i.title.includes('different debt counsellor'));
        expect(item).toBeDefined();
        expect(item?.detail).toContain('NCRDC2967');
    });

    it('flags registration under Zenowethu\'s own NCRDC number without the "different" warning', () => {
        const insights = buildCreditReportInsights({
            debtRestructuring: { ncrdcNo: 'NCRDC3693', dhsStatus: 'D4' },
        });
        expect(insights.find(i => i.title.includes('different debt counsellor'))).toBeUndefined();
        expect(insights.find(i => i.category === 'info' && i.title.includes('registered with Zenowethu'))).toBeDefined();
    });

    it('surfaces the automated bureau decision outcome and reason', () => {
        const insights = buildCreditReportInsights({
            codixResult: { outcome: 'Decline', reason: 'CLIENT IS LISTED UNDER DEBT COUNSELLING' },
        });
        const item = insights.find(i => i.category === 'info' && i.title.includes('Decline'));
        expect(item).toBeDefined();
        expect(item?.detail).toBe('CLIENT IS LISTED UNDER DEBT COUNSELLING');
    });
});

describe('buildCreditReportInsights — real-world shape (Stephen Rampai Experian report)', () => {
    it('produces the expected mix of insights without throwing', () => {
        const insights = buildCreditReportInsights({
            creditScore: { score: 0, band: 'Unknown', suppressors: ['MDS-ID number linked to a debt review application or grant'] },
            codixResult: { outcome: 'Decline', reason: 'CLIENT IS LISTED UNDER DEBT COUNSELLING' },
            debtRestructuring: {
                ncrdcNo: 'NCRDC2967',
                debtCounsellorName: 'SEMAR MUHAMMAD',
                debtReviewDate: '2023-01-10',
                dhsStatus: 'APPLICATION FOR VOLUNTARY DEBT RESTRUCTURING',
            },
            summary: { totalDebt: 0, totalInstallment: 0, activeAccounts: 0, closedAccounts: 0 },
            income: { grossSalary: 0, netSalary: 0, affordability: 'NA' },
            adverseListings: [
                {
                    creditor: 'LEWIS STORES',
                    accountNumber: '0903150',
                    adverseCode: 'Written Off',
                    lastPaymentDate: yearsAgo(2),
                },
            ],
            accounts: [],
            enquirySummary: { totalLast12Months: 9, excessiveFlag: true },
            _occurrences: { idNumber: [{ value: '8908035317089', count: 2 }] },
        });

        expect(insights.some(i => i.category === 'dispute' && i.title.includes('enquiries'))).toBe(true);
        expect(insights.some(i => i.category === 'info' && i.title.includes('different debt counsellor'))).toBe(true);
        expect(insights.some(i => i.category === 'info' && i.title.includes('Decline'))).toBe(true);
        // Last paid well under 3 years ago (relative to test run time) — not yet prescribed.
        expect(insights.some(i => i.title.includes('prescription'))).toBe(false);
    });
});
