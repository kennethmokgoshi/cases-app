import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib'
import { checkQuoteFulfilmentSafe } from '@zenowethu/shared-lib/src/finance/quote-case-sync'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const RecordPaymentSchema = z.object({
  amount:    z.number().positive(),
  date:      z.string().datetime().optional(),
  method:    z.string().min(1).max(50),
  reference: z.string().max(100).optional(),
  notes:     z.string().max(1000).optional(),
}).strict()

/** Payments allocated to this invoice, newest first. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, total: true, status: true },
    })
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const payments = await prisma.payment.findMany({
      where:   { invoiceId: id, status: { not: 'CANCELLED' } },
      orderBy: { date: 'desc' },
      include: { recordedBy: { select: { firstName: true, lastName: true } } },
    })

    const amountPaid = payments.reduce((s, p) => s + Number(p.amount), 0)

    return NextResponse.json({
      payments,
      amountPaid,
      balanceDue:  Math.max(0, Number(invoice.total) - amountPaid),
      overpaidBy:  Math.max(0, amountPaid - Number(invoice.total)),
    })
  } catch (err) {
    logger.error('[GET /api/finance/invoices/[id]/payments]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

/**
 * Record a collection against an invoice. Creates a Payment linked to the
 * invoice (and its client/case) and rolls the invoice status forward to
 * PARTIALLY_PAID or PAID based on the running total collected.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = RecordPaymentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, type: true, status: true, total: true, clientId: true, caseId: true },
    })
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (invoice.type !== 'INVOICE') {
      return NextResponse.json({ error: 'Payments can only be recorded against invoices, not quotations' }, { status: 409 })
    }
    if (invoice.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Cannot record a payment against a cancelled invoice' }, { status: 409 })
    }

    const input = parsed.data

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          amount:       input.amount,
          date:         input.date ? new Date(input.date) : new Date(),
          method:       input.method,
          reference:    input.reference ?? null,
          notes:        input.notes ?? null,
          category:     'INVOICE_PAYMENT',
          status:       'COMPLETED',
          invoiceId:    invoice.id,
          clientId:     invoice.clientId,
          caseId:       invoice.caseId,
          recordedById: session.user.id,
        },
      })

      const paidAgg = await tx.payment.aggregate({
        where: { invoiceId: invoice.id, status: { not: 'CANCELLED' } },
        _sum:  { amount: true },
      })
      const amountPaid = Number(paidAgg._sum.amount ?? 0)
      const newStatus  = amountPaid >= Number(invoice.total) ? 'PAID' : 'PARTIALLY_PAID'

      const updated = await tx.invoice.update({
        where: { id: invoice.id },
        data:  { status: newStatus },
      })

      return { payment, invoice: updated, amountPaid }
    })

    // Captured payments may now cover the case's accepted quote — advance the
    // case workflow (forward-only). Never fails the recorded payment.
    const quoteFulfilment = await checkQuoteFulfilmentSafe(invoice.caseId, session.user.id)

    return NextResponse.json({
      ...result,
      balanceDue: Math.max(0, Number(result.invoice.total) - result.amountPaid),
      overpaidBy: Math.max(0, result.amountPaid - Number(result.invoice.total)),
      quoteFulfilment,
    }, { status: 201 })
  } catch (err) {
    logger.error('[POST /api/finance/invoices/[id]/payments]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
