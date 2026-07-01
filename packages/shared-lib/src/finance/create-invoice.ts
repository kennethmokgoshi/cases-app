/**
 * Shared invoice/quote creation — Prisma-backed (server-only).
 *
 * Node-only (imports `prisma`). Import directly from this file in server route
 * handlers — do NOT re-export from the package index, and never import it into a
 * client component.
 *
 * Centralises the logic previously duplicated between
 * `apps/finance/app/api/finance/invoices/route.ts` and
 * `apps/cases/app/api/finance/invoices/route.ts`, and encodes the bank-account
 * selection rules:
 *   - Regular staff: forced to the org default BankAccount (normally FNB).
 *   - Executive / Manager / Senior Manager / Finance: may choose between active
 *     org BankAccounts (FNB / Capitec / etc.) via `bankAccountId`.
 *   - Admin: may additionally pass `useOwnBanking: true` to use their own
 *     `StaffBankingDetail` instead of an org account.
 *   - Only Admin/Executive/Finance may create a `type: 'INVOICE'` document at
 *     all; everyone else must use `type: 'QUOTE'` (unchanged from prior behavior).
 */

import { prisma, Prisma } from '@zenowethu/database';
import { randomUUID } from 'crypto';
import { allocateDocumentNumber } from './document-number';

export interface InvoiceLineItemInput {
  creditor?: string;
  serviceKey?: string;
  serviceLabel?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
}

export interface InvoiceActorRoles {
  isAdmin: boolean;
  isExecutive: boolean;
  isFinance: boolean;
  isManager: boolean;
  isSeniorManager: boolean;
}

export function computeInvoiceActorRoles(user: {
  isAdmin?: boolean | null;
  isExecutive?: boolean | null;
  isManager?: boolean | null;
  isSeniorManager?: boolean | null;
  role?: string | null;
  userType?: string | null;
}): InvoiceActorRoles {
  const role = user.role?.toUpperCase();
  const userType = user.userType?.toUpperCase();
  return {
    isAdmin: user.isAdmin === true,
    isExecutive: user.isExecutive === true || role === 'EXECUTIVE',
    isFinance: role === 'FINANCE' || userType === 'FINANCE',
    isManager: user.isManager === true || role === 'MANAGER',
    isSeniorManager: user.isSeniorManager === true || role === 'SENIOR_MANAGER',
  };
}

export interface CreateInvoiceInput {
  type: 'INVOICE' | 'QUOTE';
  clientId?: string;
  caseId?: string;
  projectId?: string;
  lineItems: InvoiceLineItemInput[];
  dueAt: string;
  notes?: string;
  reference?: string;
  vatRate: number;
  bankAccountId?: string;
  /** Admin-only: use the creator's own personal banking instead of an org account. */
  useOwnBanking?: boolean;
}

export async function createInvoiceForUser(
  input: CreateInvoiceInput,
  roles: InvoiceActorRoles,
  createdById: string,
) {
  if (
    input.type === 'INVOICE'
    && !roles.isAdmin && !roles.isExecutive && !roles.isFinance
  ) {
    return {
      ok: false as const,
      status: 403,
      error: 'You are not permitted to create invoices. Please use Quotation mode.',
    };
  }

  const canChooseOrgBank = roles.isAdmin || roles.isExecutive || roles.isFinance
    || roles.isManager || roles.isSeniorManager;

  if (input.useOwnBanking && !roles.isAdmin) {
    return {
      ok: false as const,
      status: 403,
      error: 'Only Admin may use their own personal banking on an invoice or quote.',
    };
  }

  let bankAccountId: string | undefined;
  let personalBankingUserId: string | undefined;

  if (input.useOwnBanking) {
    personalBankingUserId = createdById;
  } else if (!canChooseOrgBank) {
    const defaultBank = await prisma.bankAccount.findFirst({ where: { isDefault: true, isActive: true } });
    if (!defaultBank) {
      return {
        ok: false as const,
        status: 500,
        error: 'No default banking details found. Please contact an administrator.',
      };
    }
    if (input.bankAccountId && input.bankAccountId !== defaultBank.id) {
      return { ok: false as const, status: 403, error: 'Staff and Managers can only use default banking details.' };
    }
    bankAccountId = defaultBank.id;
  } else if (input.bankAccountId) {
    bankAccountId = input.bankAccountId;
  } else {
    const defaultBank = await prisma.bankAccount.findFirst({ where: { isDefault: true, isActive: true } });
    bankAccountId = defaultBank?.id;
  }

  if (input.type === 'INVOICE' && !bankAccountId && !personalBankingUserId) {
    return { ok: false as const, status: 422, error: 'Banking details are required for Invoices.' };
  }

  const subtotal = input.lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice - (item.discount || 0),
    0,
  );
  const vatAmount = subtotal * input.vatRate;
  const total = subtotal + vatAmount;
  const year = new Date().getFullYear();
  const prefix = input.type === 'QUOTE' ? 'QUO' : 'INV';

  const invoice = await prisma.$transaction(async (tx) => {
    const invoiceNumber = await allocateDocumentNumber(tx, prefix, year);

    return tx.invoice.create({
      data: {
        invoiceNumber,
        type: input.type,
        publicToken: randomUUID(),
        clientId: input.clientId ?? null,
        caseId: input.caseId ?? null,
        projectId: input.projectId ?? null,
        lineItems: input.lineItems as unknown as Prisma.InputJsonValue,
        subtotal,
        vatRate: input.vatRate,
        vatAmount,
        total,
        dueAt: new Date(input.dueAt),
        notes: input.notes ?? null,
        reference: input.reference ?? null,
        bankAccountId: bankAccountId ?? null,
        personalBankingUserId: personalBankingUserId ?? null,
        createdById,
        status: 'DRAFT',
      },
    });
  });

  return { ok: true as const, invoice };
}

export type CreateInvoiceResult = Awaited<ReturnType<typeof createInvoiceForUser>>;
