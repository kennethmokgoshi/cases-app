/**
 * R350 admin fee invoice — Prisma-backed persistence (server-only).
 *
 * Node-only (imports `prisma`). Import directly from this file in server route
 * handlers — do NOT re-export from the package index, and never import it into a
 * client component.
 *
 * Zenowethu collects a fixed R350 admin fee per direct (B2C) debt review case.
 * The invoice uses the case creator's own banking details if they have set
 * any on their account (see `resolveStaffOrDefaultBankAssignment`), otherwise
 * falls back to Zenowethu's default org account.
 */

import { prisma, Prisma } from '@zenowethu/database';
import { randomUUID } from 'crypto';
import { allocateDocumentNumber } from './document-number';
import { resolveStaffOrDefaultBankAssignment } from './banking-details';

export const R350_ADMIN_FEE_AMOUNT = 350;

export interface CreateR350AdminFeeInvoiceParams {
  caseId: string;
  clientId: string;
  /** Consumer ID number, used as the payment reference. */
  reference: string;
  /** The case's creator — whose personal banking (if any) is used. */
  createdById: string;
}

export async function createR350AdminFeeInvoice(params: CreateR350AdminFeeInvoiceParams) {
  const { caseId, clientId, reference, createdById } = params;

  const bankAssignment = await resolveStaffOrDefaultBankAssignment(createdById);

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

  return prisma.$transaction(async (tx) => {
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
        bankAccountId: bankAssignment.bankAccountId ?? null,
        personalBankingUserId: bankAssignment.personalBankingUserId ?? null,
        createdById,
      },
    });
  });
}
