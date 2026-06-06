/**
 * POST /api/finance/invoices/[id]/attach-to-case
 *
 * Generates the invoice/quote PDF and saves it as a Document record on the
 * linked case.  Called automatically after a quote is emailed to the client so
 * staff can retrieve and view the sent PDF from the case document vault.
 *
 * Idempotent: re-calling with the same invoiceId/caseId overwrites the file and
 * updates the existing Document record rather than creating a duplicate.
 */
import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { generateInvoicePdf, InvoiceLineItem } from '@/lib/invoice-pdf'
import { z } from 'zod'
import fs from 'fs/promises'
import path from 'path'

const BodySchema = z.object({ caseId: z.string().min(1) })

const LineItemSchema = z.object({
  creditor:     z.string().optional(),
  serviceKey:   z.string().optional(),
  serviceLabel: z.string().optional(),
  description:  z.string().optional(),
  balance:      z.number().optional(),
  discount:     z.number().optional(),
  quantity:     z.number(),
  unitPrice:    z.number(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  const body = await request.json().catch(() => ({}))
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'caseId is required' }, { status: 400 })
  }
  const { caseId } = parsed.data

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        client:      { select: { firstName: true, lastName: true, email: true, phone: true, idNumber: true } },
        case:        { select: { fileNumber: true } },
        bankAccount: { select: { bankName: true, accountName: true, accountNumber: true, branchCode: true } },
        createdBy:   { select: { firstName: true, lastName: true } },
      },
    })

    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    // Ensure this invoice actually belongs to the supplied caseId
    if (invoice.caseId !== caseId) {
      return NextResponse.json({ error: 'Invoice does not belong to this case' }, { status: 403 })
    }

    // Parse line items
    const lineItemsParsed = z.array(LineItemSchema).safeParse(invoice.lineItems)
    if (!lineItemsParsed.success) {
      return NextResponse.json({ error: 'Invalid line items on invoice' }, { status: 500 })
    }
    const lineItems: InvoiceLineItem[] = lineItemsParsed.data

    const clientName = invoice.client
      ? `${invoice.client.firstName} ${invoice.client.lastName}`
      : undefined

    // Generate a fresh PDF
    const pdfBytes = await generateInvoicePdf({
      documentType:      invoice.type as 'INVOICE' | 'QUOTE',
      invoiceNumber:     invoice.invoiceNumber,
      issuedAt:          invoice.issuedAt,
      dueAt:             invoice.dueAt,
      status:            invoice.status,
      clientName,
      clientEmail:       invoice.client?.email    ?? undefined,
      clientPhone:       invoice.client?.phone    ?? undefined,
      clientIdNumber:    invoice.client?.idNumber ?? undefined,
      caseFileNumber:    invoice.case?.fileNumber ?? undefined,
      lineItems,
      subtotal:          Number(invoice.subtotal),
      vatRate:           Number(invoice.vatRate),
      vatAmount:         Number(invoice.vatAmount),
      total:             Number(invoice.total),
      notes:             invoice.notes      ?? undefined,
      reference:         invoice.reference  ?? undefined,
      createdByName:     invoice.createdBy
        ? `${invoice.createdBy.firstName} ${invoice.createdBy.lastName}`
        : undefined,
      bankName:          invoice.bankAccount?.bankName        ?? undefined,
      bankAccountName:   invoice.bankAccount?.accountName     ?? undefined,
      bankAccountNumber: invoice.bankAccount?.accountNumber   ?? undefined,
      branchCode:        invoice.bankAccount?.branchCode      ?? undefined,
    })

    // Write PDF to the case documents folder
    const fileName = `${invoice.invoiceNumber}.pdf`
    const relPath  = path.posix.join('uploads', 'documents', caseId, fileName)
    const absPath  = path.join(process.cwd(), 'public', relPath)
    await fs.mkdir(path.dirname(absPath), { recursive: true })
    await fs.writeFile(absPath, pdfBytes)

    const fileUrl  = `/${relPath}`
    const docType  = invoice.type === 'QUOTE' ? 'QUOTATION' : 'INVOICE'

    // Check for an existing Document record (avoid duplicates on resend)
    const existing = await prisma.document.findFirst({
      where: { caseId, type: docType, fileName },
    })

    if (existing) {
      await prisma.document.update({
        where: { id: existing.id },
        data:  { fileUrl, fileSize: pdfBytes.length, uploadedAt: new Date() },
      })
      return NextResponse.json({ documentId: existing.id, updated: true })
    }

    const doc = await prisma.document.create({
      data: {
        caseId,
        type:         docType,
        fileName,
        fileUrl,
        fileSize:     pdfBytes.length,
        mimeType:     'application/pdf',
        uploadedById: session.user.id,
      },
    })

    return NextResponse.json({ documentId: doc.id, created: true })
  } catch (err) {
    console.error('[POST /api/finance/invoices/[id]/attach-to-case]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
