/**
 * Debt Counsellor Fee Invoice/Quote — PDF rendering helper (Finance app).
 *
 * Loads a persisted DC_FEE_INVOICE / DC_FEE_QUOTE `Invoice` row, maps it onto the
 * Finance `InvoiceData` shape (bill-to = debt counsellor, "RE:" = consumer the
 * fees relate to) and renders the branded Zenowethu PDF. Shared by the Finance
 * download + email routes. Mirrors the Cases-app helper of the same name.
 */

import { prisma } from '@zenowethu/database'
import fs from 'fs/promises'
import path from 'path'
import { generateInvoicePdf, type InvoiceData, type InvoiceLineItem } from './invoice-pdf'

export interface DcFeeInvoiceSummary {
  id: string
  invoiceNumber: string
  dcName: string | null
  dcEmail: string | null
  caseId: string | null
  status: string
  total: number
  documentType: 'INVOICE' | 'QUOTE'
}

export interface GenerateResult {
  ok: boolean
  status?: number
  error?: string
  invoice?: DcFeeInvoiceSummary
  bytes?: Uint8Array
}

export async function generateDcFeeInvoicePdf(invoiceId: string): Promise<GenerateResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      case: { select: { fileNumber: true } },
      bankAccount: true,
      createdBy: { select: { firstName: true, lastName: true } },
    },
  })
  if (!invoice) return { ok: false, status: 404, error: 'Invoice not found' }
  if (invoice.type !== 'DC_FEE_INVOICE' && invoice.type !== 'DC_FEE_QUOTE') {
    return { ok: false, status: 400, error: 'Not a debt counsellor fee document' }
  }

  const documentType: 'INVOICE' | 'QUOTE' = invoice.type === 'DC_FEE_QUOTE' ? 'QUOTE' : 'INVOICE'
  const lineItems = invoice.lineItems as unknown as InvoiceLineItem[]

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
    bankingDetails: invoice.bankAccount
      ? {
          bankName: invoice.bankAccount.bankName,
          accountHolder: invoice.bankAccount.accountName,
          accountNumber: invoice.bankAccount.accountNumber,
          branchCode: invoice.bankAccount.branchCode ?? undefined,
        }
      : undefined,
  }

  const bytes = await generateInvoicePdf(data)
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
  }
}

export async function cacheInvoicePdf(invoiceNumber: string, bytes: Uint8Array): Promise<string> {
  const relPath = path.join('uploads', 'invoices', `${invoiceNumber}.pdf`)
  const absPath = path.join(process.cwd(), 'public', relPath)
  await fs.mkdir(path.dirname(absPath), { recursive: true })
  await fs.writeFile(absPath, bytes)
  return relPath.split(path.sep).join('/')
}
