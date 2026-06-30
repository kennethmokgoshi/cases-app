/**
 * Debt Counsellor Fee Invoice — Prisma-backed persistence (server-only).
 *
 * Node-only (imports `prisma`). Import directly from this file in server route
 * handlers — do NOT re-export from the package index, and never import it into a
 * client component. The pure catalogue/schema/maths live in `./dc-fee-invoice.ts`.
 */

import { prisma, Prisma } from '@zenowethu/database';
import { randomUUID } from 'crypto';
import { allocateDocumentNumber } from './document-number';
import {
  computeDcFeeTotals,
  buildConsumerReference,
  dcFeeReasonLabel,
  type DcFeeInvoiceInput,
} from './dc-fee-invoice';

export interface CreateDcFeeInvoiceParams {
  input: DcFeeInvoiceInput;
  /** Link to the Zenowethu case the consumer belongs to, when raised from a case. */
  caseId?: string | null;
  /** Link to the Zenowethu consumer record, when known. */
  clientId?: string | null;
  /** Staff user creating the invoice (attribution). */
  createdById: string;
}

/**
 * Persist a debt-counsellor fee invoice as a standard `Invoice` row
 * (`type: DC_FEE_INVOICE`). The DC bill-to details and consumer reference are
 * stored on the invoice; each fee reason becomes a line item. Invoice numbering
 * uses the shared atomic `INV-YYYY-NNNN` allocator so it never collides with
 * Finance-issued numbers. Returns the created invoice.
 */
export async function createDcFeeInvoice(params: CreateDcFeeInvoiceParams) {
  const { input, caseId, clientId, createdById } = params;

  const totals = computeDcFeeTotals(input.lineItems, input.applyVat);
  const reference = buildConsumerReference(input);
  const year = new Date().getFullYear();

  // Quotation vs invoice: quotes are numbered QUO-…, typed DC_FEE_QUOTE, and the
  // 30-day window reads as "valid until"; invoices read as "due".
  const isQuote = input.documentType === 'QUOTE';
  const prefix = isQuote ? 'QUO' : 'INV';
  const docType = isQuote ? 'DC_FEE_QUOTE' : 'DC_FEE_INVOICE';

  // 30-day payment/validity window by default.
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + 30);

  // Map each fee reason to the generic invoice line-item shape consumed by the
  // PDF generator (qty 1 × unit price = amount).
  const lineItems = input.lineItems.map((li) => ({
    description: li.description?.trim() || dcFeeReasonLabel(li.reasonKey),
    quantity: 1,
    unitPrice: li.amount,
  }));

  // Attach the default bank account if one is configured (the PDF generator
  // otherwise falls back to the Zenowethu banking env defaults).
  const defaultBank = await prisma.bankAccount
    .findFirst({ where: { isDefault: true } })
    .catch(() => null);

  return prisma.$transaction(async (tx) => {
    const invoiceNumber = await allocateDocumentNumber(tx, prefix, year);

    return tx.invoice.create({
      data: {
        invoiceNumber,
        type: docType,
        status: 'DRAFT',
        publicToken: randomUUID(),
        clientId: clientId ?? null,
        caseId: caseId ?? null,
        lineItems: lineItems as unknown as Prisma.InputJsonValue,
        subtotal: totals.subtotal,
        vatRate: totals.vatRate,
        vatAmount: totals.vatAmount,
        total: totals.total,
        dueAt,
        reference,
        notes: input.notes?.trim() || null,
        dcName: input.dcName.trim(),
        dcEmail: input.dcEmail?.trim() || null,
        dcTradingName: input.dcTradingName?.trim() || null,
        bankAccountId: defaultBank?.id ?? null,
        createdById,
      },
    });
  });
}
