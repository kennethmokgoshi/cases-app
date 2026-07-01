/**
 * Invoice/quote banking-details resolution — Prisma-backed (server-only).
 *
 * Node-only (imports `prisma`). Import directly from this file in server route
 * handlers — do NOT re-export from the package index, and never import it into a
 * client component.
 *
 * Resolution order for a given invoice:
 *   1. `bankAccount` relation (an org account — FNB/Capitec/etc.) if set
 *   2. `personalBankingUserId` relation (a staff member's own banking) if set
 *   3. The org's default `BankAccount` (isDefault: true)
 *   4. Hard-coded Zenowethu FNB details, if no default org account exists yet
 */

import { prisma } from '@zenowethu/database';

export interface ResolvedBankingDetails {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  branchCode?: string;
}

/** Last-resort fallback — kept in sync with the invoice-pdf.ts literal defaults. */
export const ZENOWETHU_FNB_FALLBACK: ResolvedBankingDetails = {
  bankName: 'FNB',
  accountHolder: 'Zenowethu Trading Debt Management (PTY) LTD',
  accountNumber: '62867268635',
  branchCode: '250655',
};

interface BankAccountLike {
  bankName: string;
  accountName: string;
  accountNumber: string;
  branchCode: string | null;
}

function fromBankAccount(account: BankAccountLike): ResolvedBankingDetails {
  return {
    bankName: account.bankName,
    accountHolder: account.accountName,
    accountNumber: account.accountNumber,
    branchCode: account.branchCode ?? undefined,
  };
}

/**
 * Resolve the effective banking details for an invoice that already has its
 * `bankAccount` relation loaded (avoids a redundant query when the caller has
 * already included it).
 */
export async function resolveInvoiceBankingDetails(invoice: {
  bankAccount?: BankAccountLike | null;
  personalBankingUserId?: string | null;
}): Promise<ResolvedBankingDetails> {
  if (invoice.bankAccount) {
    return fromBankAccount(invoice.bankAccount);
  }

  if (invoice.personalBankingUserId) {
    const staffBanking = await prisma.staffBankingDetail.findUnique({
      where: { userId: invoice.personalBankingUserId },
    });
    if (staffBanking) {
      return {
        bankName: staffBanking.bankName,
        accountHolder: staffBanking.accountName,
        accountNumber: staffBanking.accountNumber,
        branchCode: staffBanking.branchCode ?? undefined,
      };
    }
  }

  const defaultBank = await prisma.bankAccount.findFirst({
    where: { isDefault: true, isActive: true },
  });
  if (defaultBank) {
    return fromBankAccount(defaultBank);
  }

  return ZENOWETHU_FNB_FALLBACK;
}

/**
 * Resolve the staff banking details to attach to a *new* invoice for a given
 * user (e.g. the case creator for an R350 admin fee invoice). Returns either
 * `{ personalBankingUserId }` when that user has their own banking on file,
 * or `{ bankAccountId }` pointing at the org default account otherwise.
 */
export async function resolveStaffOrDefaultBankAssignment(
  userId: string,
): Promise<{ personalBankingUserId?: string; bankAccountId?: string }> {
  const staffBanking = await prisma.staffBankingDetail.findUnique({ where: { userId } });
  if (staffBanking) {
    return { personalBankingUserId: userId };
  }

  const defaultBank = await prisma.bankAccount.findFirst({
    where: { isDefault: true, isActive: true },
  });
  return { bankAccountId: defaultBank?.id };
}
