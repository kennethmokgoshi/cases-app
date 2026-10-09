import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn(), update: vi.fn() },
        invoice: { findUnique: vi.fn() },
        payment: { findMany: vi.fn() },
    },
}));
vi.mock('../logger', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
vi.mock('../company/company-profile-service', () => ({ getCompanyProfile: vi.fn().mockResolvedValue({ legalFeeAmount: 1700 }) }));

import { syncLegalFeesStatusAfterPayment } from './legal-fees-status-sync';
import { prisma } from '@zenowethu/database';

const setup = (current: string | null, payments: Array<{ amount: number; method: string }>, invoiceTotal: number | null = 1700) => {
    vi.mocked(prisma.case.findUnique).mockResolvedValue({ legalFeesStatus: current } as never);
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue(invoiceTotal === null ? null : ({ total: invoiceTotal } as never));
    vi.mocked(prisma.payment.findMany).mockResolvedValue(payments as never);
};

describe('syncLegalFeesStatusAfterPayment', () => {
    beforeEach(() => vi.clearAllMocks());

    it('R1,700 paid by EFT → Fees Paid Cash', async () => {
        setup('No Arrangement yet', [{ amount: 1700, method: 'EFT' }]);
        expect(await syncLegalFeesStatusAfterPayment({ caseId: 'c1', invoiceId: 'i1' })).toBe('Fees Paid Cash');
        expect(prisma.case.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { legalFeesStatus: 'Fees Paid Cash' } });
    });

    it('part payment → Paying; full debit order → Debited', async () => {
        setup('Arrangement in progress', [{ amount: 500, method: 'EFT' }]);
        expect(await syncLegalFeesStatusAfterPayment({ caseId: 'c1', invoiceId: 'i1' })).toBe('Paying');

        setup('Authorised & Pending', [{ amount: 1700, method: 'DEBIT_ORDER' }]);
        expect(await syncLegalFeesStatusAfterPayment({ caseId: 'c1', invoiceId: 'i1' })).toBe('Debited');
    });

    it('sums several payments and uses the Company Profile fee when there is no invoice row', async () => {
        setup('Paying', [{ amount: 700, method: 'EFT' }, { amount: 1000, method: 'CASH' }], null);
        expect(await syncLegalFeesStatusAfterPayment({ caseId: 'c1' })).toBe('Fees Paid Cash');
    });

    it('leaves Cash Focus alone and does nothing without payments', async () => {
        setup('Cash Focus', [{ amount: 1700, method: 'EFT' }]);
        expect(await syncLegalFeesStatusAfterPayment({ caseId: 'c1', invoiceId: 'i1' })).toBeNull();

        setup('No Arrangement yet', []);
        expect(await syncLegalFeesStatusAfterPayment({ caseId: 'c1', invoiceId: 'i1' })).toBeNull();
        expect(prisma.case.update).not.toHaveBeenCalled();
    });

    it('never throws when the database fails', async () => {
        vi.mocked(prisma.case.findUnique).mockRejectedValue(new Error('db down'));
        vi.mocked(prisma.payment.findMany).mockResolvedValue([] as never);
        expect(await syncLegalFeesStatusAfterPayment({ caseId: 'c1' })).toBeNull();
    });
});
