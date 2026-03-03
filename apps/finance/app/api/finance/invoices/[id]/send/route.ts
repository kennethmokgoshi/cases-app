import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { generateInvoicePdf, InvoiceLineItem, InvoiceData } from '@/lib/invoice-pdf'
import { z } from 'zod'
import nodemailer from 'nodemailer'

const SendInvoiceSchema = z.object({
  to:      z.string().email(),
  subject: z.string().min(1).max(200).optional(),
  message: z.string().max(2000).optional() })

function buildEmailHtml(invoice: { invoiceNumber: string; total: unknown }, message?: string): string {
  const totalFormatted = new Intl.NumberFormat('en-ZA', {
    style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(Number(invoice.total))

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family: Arial, sans-serif; color: #222; background: #f9f9f9; padding: 0; margin: 0;">
  <div style="max-width: 600px; margin: 32px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="background: #0AB882; padding: 28px 32px;">
      <h1 style="color: #fff; margin: 0; font-size: 22px;">Invoice ${invoice.invoiceNumber}</h1>
      <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Zenowethu Debt Management</p>
    </div>
    <div style="padding: 32px;">
      ${message ? `<p style="margin: 0 0 24px; color: #444; line-height: 1.6;">${message.replace(/\n/g, '<br/>')}</p>` : ''}
      <p style="margin: 0 0 8px; color: #666; font-size: 14px;">Please find your invoice attached.</p>
      <div style="background: #f4f4f4; border-radius: 6px; padding: 16px 20px; margin: 24px 0; display: inline-block;">
        <p style="margin: 0; font-size: 13px; color: #888;">Total Due</p>
        <p style="margin: 4px 0 0; font-size: 24px; font-weight: bold; color: #0AB882;">${totalFormatted}</p>
      </div>
      <p style="margin: 24px 0 0; font-size: 12px; color: #999;">
        This is an automated email from Zenowethu Debt Management. Please do not reply to this email.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim()
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
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
      where: { id: params.id },
      include: {
        client: { select: { firstName: true, lastName: true, email: true } },
        case:   { select: { fileNumber: true } } } })

    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (invoice.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Cannot send a cancelled invoice' }, { status: 409 })
    }

    // Validate lineItems JSON
    const lineItems = invoice.lineItems as unknown as InvoiceLineItem[]

    const invoiceData: InvoiceData = {
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

    // Send via nodemailer directly (SmtpEmailProvider does not support attachments)
    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST   || 'localhost',
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS },
      tls: { rejectUnauthorized: false } })

    await transporter.sendMail({
      from:    process.env.EMAIL_FROM || process.env.SMTP_USER,
      to:      input.to,
      subject: input.subject ?? `Invoice ${invoice.invoiceNumber} from Zenowethu`,
      html:    buildEmailHtml(invoice, input.message),
      attachments: [{
        filename:    `${invoice.invoiceNumber}.pdf`,
        content:     Buffer.from(pdfBytes),
        contentType: 'application/pdf' }] })

    // Update invoice status to SENT
    await prisma.invoice.update({
      where: { id: params.id },
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
