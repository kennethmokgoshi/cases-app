/**
 * Debt Counsellor Fee Invoice — PDF rendering helper (server-only).
 *
 * Loads a persisted DC_FEE_INVOICE `Invoice` row, maps it onto the shared
 * `InvoiceData` shape (bill-to = debt counsellor, "RE:" = consumer the fees
 * relate to) and renders the branded Zenowethu PDF. Shared by the download
 * (`/api/dc-fee-invoices/[id]/pdf`) and email (`/api/dc-fee-invoices/[id]/send`)
 * routes so both produce byte-identical documents.
 */

import { prisma } from '@zenowethu/database';
import fs from 'fs/promises';
import path from 'path';
import { generateInvoicePdf, type InvoiceData, type InvoiceLineItem } from './invoice-pdf';

/** Minimal invoice fields the PDF/send routes need — kept small so the result
 *  union below stays a clean discriminated union (Prisma payload types are too
 *  deep for TS to narrow on `ok` when carried directly). */
export interface DcFeeInvoiceSummary {
  id: string;
  invoiceNumber: string;
  dcName: string | null;
  dcEmail: string | null;
  caseId: string | null;
  status: string;
  total: number;
  /** 'QUOTE' for DC_FEE_QUOTE, else 'INVOICE' — drives email/UI wording. */
  documentType: 'INVOICE' | 'QUOTE';
}

/** Flat result shape (not a discriminated union): the Cases app compiles with
 *  `strict: false`, where truthiness narrowing of unions does not apply. Callers
 *  check `ok` then read the relevant optional fields. */
export interface GenerateResult {
  ok: boolean;
  /** Populated when ok is false. */
  status?: number;
  error?: string;
  /** Populated when ok is true. */
  invoice?: DcFeeInvoiceSummary;
  bytes?: Uint8Array;
}

/**
 * Generate the PDF bytes for a DC fee invoice. Returns a discriminated result so
 * callers can map failures onto HTTP status codes.
 */
export async function generateDcFeeInvoicePdf(invoiceId: string): Promise<GenerateResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      case: { select: { fileNumber: true } },
      bankAccount: true,
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });
  if (!invoice) return { ok: false, status: 404, error: 'Invoice not found' };
  if (invoice.type !== 'DC_FEE_INVOICE' && invoice.type !== 'DC_FEE_QUOTE') {
    return { ok: false, status: 400, error: 'Not a debt counsellor fee document' };
  }

  const documentType: 'INVOICE' | 'QUOTE' = invoice.type === 'DC_FEE_QUOTE' ? 'QUOTE' : 'INVOICE';
  const lineItems = invoice.lineItems as unknown as InvoiceLineItem[];

  const data: InvoiceData = {
    documentType,
    invoiceNumber: invoice.invoiceNumber,
    issuedAt: invoice.issuedAt,
    dueAt: invoice.dueAt,
    status: invoice.status,
    billTo: {
      name: invoice.dcName ?? 'Debt Counsellor',
      tradingName: invoice.dcTradingName ?? undefined,
      email: invoice.dcEmail ?? undefined,
    },
    reLine: invoice.reference ?? undefined,
    caseFileNumber: invoice.case?.fileNumber ?? undefined,
    lineItems,
    subtotal: Number(invoice.subtotal),
    vatRate: Number(invoice.vatRate),
    vatAmount: Number(invoice.vatAmount),
    total: Number(invoice.total),
    notes: invoice.notes ?? undefined,
    createdByName: invoice.createdBy
      ? `${invoice.createdBy.firstName} ${invoice.createdBy.lastName}`
      : undefined,
    bankName: invoice.bankAccount?.bankName,
    bankAccountName: invoice.bankAccount?.accountName,
    bankAccountNumber: invoice.bankAccount?.accountNumber,
    branchCode: invoice.bankAccount?.branchCode ?? undefined,
  };

  const bytes = await generateInvoicePdf(data);
  return {
    ok: true,
    invoice: {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      dcName: invoice.dcName,
      dcEmail: invoice.dcEmail,
      caseId: invoice.caseId,
      status: invoice.status,
      total: Number(invoice.total),
      documentType,
    },
    bytes,
  };
}

/**
 * Persist the rendered PDF under `public/uploads/invoices/<number>.pdf` and return
 * the web-relative path (forward slashes) for caching / attachment URLs.
 */
export async function cacheInvoicePdf(invoiceNumber: string, bytes: Uint8Array): Promise<string> {
  const relPath = path.join('uploads', 'invoices', `${invoiceNumber}.pdf`);
  const absPath = path.join(process.cwd(), 'public', relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, bytes);
  return relPath.split(path.sep).join('/');
}
