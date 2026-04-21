import { prisma } from '@zenowethu/database'
import { generateInvoicePdf, InvoiceLineItem } from '@/lib/invoice-pdf'
import { NextResponse } from 'next/server'

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const invoice = await prisma.invoice.findUnique({
    where:   { publicToken: token },
    include: {
      client: { select: { firstName: true, lastName: true, email: true } },
      case:   { select: { fileNumber: true } },
    },
  })

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const pdfBytes = await generateInvoicePdf({
    documentType:   invoice.type as 'INVOICE' | 'QUOTE',
    invoiceNumber:  invoice.invoiceNumber,
    issuedAt:       invoice.issuedAt,
    dueAt:          invoice.dueAt,
    status:         invoice.status,
    clientName:     invoice.client ? `${invoice.client.firstName} ${invoice.client.lastName}` : undefined,
    clientEmail:    invoice.client?.email ?? undefined,
    caseFileNumber: invoice.case?.fileNumber ?? undefined,
    lineItems:      invoice.lineItems as unknown as InvoiceLineItem[],
    subtotal:       Number(invoice.subtotal),
    vatRate:        Number(invoice.vatRate),
    vatAmount:      Number(invoice.vatAmount),
    total:          Number(invoice.total),
    notes:          invoice.notes ?? undefined,
    reference:      invoice.reference ?? undefined,
  })

  return new Response(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="${invoice.invoiceNumber}.pdf"`,
    },
  })
}
