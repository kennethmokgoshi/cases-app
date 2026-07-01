import { describe, it, expect, vi, beforeEach } from 'vitest';

const staffBankingFindUniqueMock = vi.fn();
const bankAccountFindFirstMock = vi.fn();

vi.mock('@zenowethu/database', () => ({
  prisma: {
    staffBankingDetail: { findUnique: (...a: unknown[]) => staffBankingFindUniqueMock(...a) },
    bankAccount: { findFirst: (...a: unknown[]) => bankAccountFindFirstMock(...a) },
  },
}));

import {
  resolveInvoiceBankingDetails,
  resolveStaffOrDefaultBankAssignment,
  ZENOWETHU_FNB_FALLBACK,
} from './banking-details';

describe('resolveInvoiceBankingDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers the invoice.bankAccount relation when set', async () => {
    const result = await resolveInvoiceBankingDetails({
      bankAccount: { bankName: 'Capitec Business', accountName: 'Zenowethu Debt Management (Pty) Ltd', accountNumber: '105 181 8346', branchCode: '450105' },
      personalBankingUserId: 'user-1',
    });

    expect(result).toEqual({
      bankName: 'Capitec Business',
      accountHolder: 'Zenowethu Debt Management (Pty) Ltd',
      accountNumber: '105 181 8346',
      branchCode: '450105',
    });
    expect(staffBankingFindUniqueMock).not.toHaveBeenCalled();
  });

  it('falls back to the personal banking user when no bankAccount is set', async () => {
    staffBankingFindUniqueMock.mockResolvedValue({
      bankName: 'FNB', accountName: 'Jane Staff', accountNumber: '111222333', branchCode: '250655',
    });

    const result = await resolveInvoiceBankingDetails({ bankAccount: null, personalBankingUserId: 'user-1' });

    expect(staffBankingFindUniqueMock).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(result).toEqual({
      bankName: 'FNB', accountHolder: 'Jane Staff', accountNumber: '111222333', branchCode: '250655',
    });
  });

  it('falls back to the org default BankAccount when personal banking user has none on file', async () => {
    staffBankingFindUniqueMock.mockResolvedValue(null);
    bankAccountFindFirstMock.mockResolvedValue({
      bankName: 'FNB', accountName: 'Zenowethu Trading Debt Management (PTY) LTD', accountNumber: '62867268635', branchCode: '250655',
    });

    const result = await resolveInvoiceBankingDetails({ bankAccount: null, personalBankingUserId: 'user-1' });

    expect(bankAccountFindFirstMock).toHaveBeenCalledWith({ where: { isDefault: true, isActive: true } });
    expect(result.accountNumber).toBe('62867268635');
  });

  it('falls back to the hardcoded FNB details when no default BankAccount exists yet', async () => {
    bankAccountFindFirstMock.mockResolvedValue(null);

    const result = await resolveInvoiceBankingDetails({ bankAccount: null, personalBankingUserId: null });

    expect(result).toEqual(ZENOWETHU_FNB_FALLBACK);
  });
});

describe('resolveStaffOrDefaultBankAssignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns personalBankingUserId when the user has their own banking on file', async () => {
    staffBankingFindUniqueMock.mockResolvedValue({ bankName: 'FNB' });

    const result = await resolveStaffOrDefaultBankAssignment('user-1');

    expect(result).toEqual({ personalBankingUserId: 'user-1' });
    expect(bankAccountFindFirstMock).not.toHaveBeenCalled();
  });

  it('returns the org default bankAccountId when the user has no personal banking', async () => {
    staffBankingFindUniqueMock.mockResolvedValue(null);
    bankAccountFindFirstMock.mockResolvedValue({ id: 'bank-1' });

    const result = await resolveStaffOrDefaultBankAssignment('user-1');

    expect(result).toEqual({ bankAccountId: 'bank-1' });
  });
});
