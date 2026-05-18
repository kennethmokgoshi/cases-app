import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { generateInvoicePdf, InvoiceLineItem } from '@/lib/invoice-pdf'
import { z } from 'zod'
import fs from 'fs/promises'
import path from 'path'

const LineItemSchema = z.object({
  description: z.string().optional(),
  creditor: z.string().optional(),
  serviceLabel: z.string().optional(),
  quantity: z.number(),
  unitPrice: z.number(),
  discount: z.number().optional() })

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        client: { select: { firstName: true, lastName: true, email: true } },
        case:   { select: { fileNumber: true } },
        bankAccount: true,
      } })

    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Validate lineItems JSON shape
    const lineItemsParsed = z.array(LineItemSchema).safeParse(invoice.lineItems)
    if (!lineItemsParsed.success) {
      return NextResponse.json({ error: 'Invalid line items data' }, { status: 500 })
    }

    const lineItems: InvoiceLineItem[] = lineItemsParsed.data

    // Check cached PDF (fresh if file mtime >= invoice.updatedAt)
    if (invoice.pdfPath) {
      try {
        const absPath = path.join(process.cwd(), 'public', invoice.pdfPath)
        const stat = await fs.stat(absPath)
        if (stat.mtime >= invoice.updatedAt) {
          const fileBytes = await fs.readFile(absPath)
          return new Response(fileBytes, {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
              'Content-Length': String(fileBytes.byteLength) } })
        }
      } catch {
        // File missing or unreadable — regenerate below
      }
    }

    // Generate fresh PDF
    const clientName = invoice.client
      ? `${invoice.client.firstName} ${invoice.client.lastName}`
      : undefined

    const pdfBytes = await generateInvoicePdf({
      invoiceNumber:   invoice.invoiceNumber,
      issuedAt:        invoice.issuedAt,
      dueAt:           invoice.dueAt,
      status:          invoice.status,
      clientName,
      clientEmail:     invoice.client?.email ?? undefined,
      caseFileNumber:  invoice.case?.fileNumber ?? undefined,
      lineItems,
      subtotal:        Number(invoice.subtotal),
      vatRate:         Number(invoice.vatRate),
      vatAmount:       Number(invoice.vatAmount),
      total:           Number(invoice.total),
      notes:           invoice.notes ?? undefined,
      reference:       invoice.reference ?? undefined,
      bankingDetails:  invoice.bankAccount ? {
        bankName:      invoice.bankAccount.bankName,
        accountHolder: invoice.bankAccount.accountName,
        accountNumber: invoice.bankAccount.accountNumber,
        branchCode:    invoice.bankAccount.branchCode ?? undefined,
      } : (invoice.type === 'QUOTE' ? null : undefined)
    })

    // Cache to disk — TODO: replace with object storage in production
    const relPath  = path.join('uploads', 'invoices', `${invoice.invoiceNumber}.pdf`)
    const absPath  = path.join(process.cwd(), 'public', relPath)
    await fs.mkdir(path.dirname(absPath), { recursive: true })
    await fs.writeFile(absPath, pdfBytes)

    // Update pdfPath in DB (fire-and-forget)
    prisma.invoice.update({ where: { id }, data: { pdfPath: relPath } }).catch(() => {})

    return new Response(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
        'Content-Length': String(pdfBytes.byteLength) } })
  } catch (err) {
    logger.error('[GET /api/finance/invoices/[id]/pdf]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
