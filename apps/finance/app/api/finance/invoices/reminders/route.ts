import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  try {
    const now = new Date()

    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        status: 'SENT',
        dueAt:  { lt: now } },
      include: {
        client: { select: { firstName: true, lastName: true, email: true } },
        case:   { select: { fileNumber: true } } } })

    if (overdueInvoices.length === 0) {
      return NextResponse.json({ processed: 0, emailsSent: 0, message: 'No overdue invoices found' })
    }

    await prisma.invoice.updateMany({
      where: { id: { in: overdueInvoices.map(i => i.id) }, status: 'SENT' },
      data:  { status: 'OVERDUE' } })

    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST   || 'localhost',
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      tls:    { rejectUnauthorized: false } })

    let emailsSent = 0
    for (const invoice of overdueInvoices) {
      const email = invoice.sentTo || invoice.client?.email
      if (!email) continue
      try {
        const totalFormatted = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(invoice.total))
        await transporter.sendMail({
          from:    process.env.EMAIL_FROM || process.env.SMTP_USER,
          to:      email,
          subject: `Payment Reminder: Invoice ${invoice.invoiceNumber} is Overdue`,
          html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #dc2626; padding: 24px 32px;">
    <h1 style="color: #fff; margin: 0; font-size: 20px;">Payment Reminder</h1>
  </div>
  <div style="padding: 32px; background: #fff;">
    <p>Dear ${invoice.client ? `${invoice.client.firstName} ${invoice.client.lastName}` : 'Client'},</p>
    <p>Invoice <strong>${invoice.invoiceNumber}</strong> for <strong>${totalFormatted}</strong> was due on
    <strong>${new Date(invoice.dueAt).toLocaleDateString('en-ZA')}</strong> and remains unpaid.</p>
    <p>Please arrange payment at your earliest convenience to avoid further action.</p>
    <p style="font-size: 12px; color: #999; margin-top: 32px;">
      Zenowethu Debt Management — automated payment reminder
    </p>
  </div>
</div>` })
        emailsSent++
      } catch (emailErr) {
        logger.error(`[invoice-reminders] Failed to send reminder for ${invoice.invoiceNumber}:`, emailErr)
      }
    }

    console.info(`[invoice-reminders] Processed ${overdueInvoices.length} overdue invoices, sent ${emailsSent} reminder emails`)
    return NextResponse.json({ processed: overdueInvoices.length, emailsSent })
  } catch (err) {
    logger.error('[POST /api/finance/invoices/reminders]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
