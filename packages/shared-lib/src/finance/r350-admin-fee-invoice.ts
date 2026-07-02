/**
 * R350 admin fee invoice — Prisma-backed persistence (server-only).
 *
 * Node-only (imports `prisma`). Import directly from this file in server route
 * handlers — do NOT re-export from the package index, and never import it into a
 * client component.
 *
 * Zenowethu collects a fixed R350 admin fee per direct (B2C) debt review case.
 * Whoever sends the invoice explicitly chooses the banking on it each time —
 * either the case creator's own `StaffBankingDetail`, or Zenowethu's default
 * org account. Unlike general invoices/quotes, there is no silent fallback:
 * if "own banking" is chosen but the creator hasn't added any, this fails with
 * a clear error rather than substituting Zenowethu's account.
 */

import { prisma, Prisma } from '@zenowethu/database';
import { randomUUID } from 'crypto';
import { allocateDocumentNumber } from './document-number';

export const R350_ADMIN_FEE_AMOUNT = 350;

export interface CreateR350AdminFeeInvoiceParams {
  caseId: string;
  clientId: string;
  /** Consumer ID number, used as the payment reference. */
  reference: string;
  /** The case's creator — whose personal banking is used when useOwnBanking is true. */
  createdById: string;
  /** Explicit choice made by whoever is sending: their own banking, or Zenowethu's default. */
  useOwnBanking: boolean;
}

export async function createR350AdminFeeInvoice(params: CreateR350AdminFeeInvoiceParams) {
  const { caseId, clientId, reference, createdById, useOwnBanking } = params;

  let bankAccountId: string | undefined;
  let personalBankingUserId: string | undefined;

  if (useOwnBanking) {
    const staffBanking = await prisma.staffBankingDetail.findUnique({ where: { userId: createdById } });
    if (!staffBanking) {
      return {
        ok: false as const,
        status: 422,
        error: 'You have not added your own banking details yet. Add them on your Account page, or choose Zenowethu\'s default banking instead.',
      };
    }
    personalBankingUserId = createdById;
  } else {
    const defaultBank = await prisma.bankAccount.findFirst({ where: { isDefault: true, isActive: true } });
    if (!defaultBank) {
      return {
        ok: false as const,
        status: 500,
        error: 'No default banking details found. Please contact an administrator.',
      };
    }
    bankAccountId = defaultBank.id;
  }

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + 30);

  const year = new Date().getFullYear();

  const lineItems = [
    {
      description: 'R350 Admin Fee (Debt Review Administration Levy)',
      quantity: 1,
      unitPrice: R350_ADMIN_FEE_AMOUNT,
    },
  ];

  const invoice = await prisma.$transaction(async (tx) => {
    const invoiceNumber = await allocateDocumentNumber(tx, 'INV', year);

    return tx.invoice.create({
      data: {
        invoiceNumber,
        type: 'INVOICE',
        status: 'DRAFT',
        publicToken: randomUUID(),
        clientId,
        caseId,
        lineItems: lineItems as unknown as Prisma.InputJsonValue,
        subtotal: R350_ADMIN_FEE_AMOUNT,
        vatRate: 0,
        vatAmount: 0,
        total: R350_ADMIN_FEE_AMOUNT,
        dueAt,
        reference,
        bankAccountId: bankAccountId ?? null,
        personalBankingUserId: personalBankingUserId ?? null,
        createdById,
      },
    });
  });

  return { ok: true as const, invoice };
}

export type CreateR350AdminFeeInvoiceResult = Awaited<ReturnType<typeof createR350AdminFeeInvoice>>;
