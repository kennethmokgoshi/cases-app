import { logger, renderBrandedEmail } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { generateInvoicePdf, InvoiceLineItem, InvoiceData } from '@/lib/invoice-pdf'
import { z } from 'zod'
import { sendEmail } from '@/lib/email'

const SendInvoiceSchema = z.object({
  to:      z.string().email(),
  subject: z.string().min(1).max(200).optional(),
  message: z.string().max(2000).optional() })

function buildEmailHtml(
  invoice: { invoiceNumber: string; total: unknown; type?: string; publicToken?: string | null },
  message?: string,
): string {
  const totalFormatted = new Intl.NumberFormat('en-ZA', {
    style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(Number(invoice.total))

  const isQuote    = invoice.type === 'QUOTE'
  const docLabel   = isQuote ? 'Quotation' : 'Invoice'
  const credoUrl   = process.env.CREDO_APP_URL || 'https://credo.zenowethu.co.za'
  const viewLink   = invoice.publicToken ? `${credoUrl}/quote/${invoice.publicToken}` : null

  const content = `
    <h2 style="margin: 0 0 15px; color: #0d3870; font-size: 22px;">${docLabel} ${invoice.invoiceNumber}</h2>
    ${message ? `<p style="margin: 0 0 24px; color: #444; line-height: 1.6;">${message.replace(/\n/g, '<br/>')}</p>` : ''}
    <p style="margin: 0 0 15px; color: #666; font-size: 14px;">Please find your ${docLabel.toLowerCase()} attached to this email.</p>
    
    <div style="background-color: #f4f7f9; border-radius: 8px; padding: 25px; margin: 25px 0; border: 1px solid #e1e8ed; display: inline-block; min-width: 200px;">
        <p style="margin: 0; font-size: 13px; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${isQuote ? 'Quoted Total' : 'Total Due'}</p>
        <p style="margin: 5px 0 0; font-size: 28px; font-weight: bold; color: #0d3870;">${totalFormatted}</p>
    </div>
    
    <p style="margin-top: 20px; font-size: 14px; color: #666;">
        This is an automated financial notification from Zenowethu Debt Management.
    </p>
  `;

  return renderBrandedEmail(content, {
      title: `${docLabel} ${invoice.invoiceNumber}`,
      previewText: `Your ${docLabel.toLowerCase()} from Zenowethu is ready for review.`,
      button: viewLink ? {
          text: `View & Download ${docLabel} Online`,
          url: viewLink
      } : undefined
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = SendInvoiceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  const input = parsed.data

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        client: { select: { firstName: true, lastName: true, email: true } },
        case:   { select: { fileNumber: true } },
      },
    })

    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (invoice.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Cannot send a cancelled invoice' }, { status: 409 })
    }

    // Validate lineItems JSON
    const lineItems = invoice.lineItems as unknown as InvoiceLineItem[]

    const invoiceData: InvoiceData = {
      documentType:   invoice.type as 'INVOICE' | 'QUOTE',
      invoiceNumber:  invoice.invoiceNumber,
      issuedAt:       invoice.issuedAt,
      dueAt:          invoice.dueAt,
      status:         invoice.status,
      clientName:     invoice.client ? `${invoice.client.firstName} ${invoice.client.lastName}` : undefined,
      clientEmail:    invoice.client?.email ?? undefined,
      caseFileNumber: invoice.case?.fileNumber ?? undefined,
      lineItems,
      subtotal:       Number(invoice.subtotal),
      vatRate:        Number(invoice.vatRate),
      vatAmount:      Number(invoice.vatAmount),
      total:          Number(invoice.total),
      notes:          invoice.notes ?? undefined,
      reference:      invoice.reference ?? undefined }

    const pdfBytes = await generateInvoicePdf(invoiceData)

    const emailResult = await sendEmail({
      to:        input.to,
      fromName:  session.user.name || undefined,
      fromEmail: session.user.email || undefined,
      subject:   input.subject ?? `${invoice.type === 'QUOTE' ? 'Quotation' : 'Invoice'} ${invoice.invoiceNumber} from Zenowethu`,
      html:      buildEmailHtml(
        { invoiceNumber: invoice.invoiceNumber, total: invoice.total, type: invoice.type, publicToken: invoice.publicToken },
        input.message,
      ),
      attachments: [{
        filename:    `${invoice.invoiceNumber}.pdf`,
        content:     Buffer.from(pdfBytes),
        contentType: 'application/pdf' }] })

    if (!emailResult.success) {
      logger.error(`[invoice-send] Failed to send email for ${invoice.invoiceNumber}:`, emailResult.error)
      return NextResponse.json({ error: 'Email delivery failed: ' + emailResult.error }, { status: 502 })
    }

    // Update invoice status to SENT
    await prisma.invoice.update({
      where: { id },
      data:  { status: 'SENT', sentAt: new Date(), sentTo: input.to } })

    // Note: NotificationLog not used here — caseId is non-nullable on that model
    // and invoice sends are standalone financial events, not case notifications.
    console.info(`[invoice-send] ${invoice.invoiceNumber} sent to ${input.to} by ${session.user.id}`)

    return NextResponse.json({ success: true, sentTo: input.to })
  } catch (err) {
    logger.error('[POST /api/finance/invoices/[id]/send]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
