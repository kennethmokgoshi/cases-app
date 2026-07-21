import { logger } from '@zenowethu/shared-lib'
import { auth } from '@zenowethu/shared-lib'
import { checkQuoteFulfilmentSafe } from '@zenowethu/shared-lib/src/finance/quote-case-sync'
import { prisma, Prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const LineItemSchema = z.object({
  creditor:     z.string().max(200).optional(),
  serviceKey:   z.string().max(100).optional(),
  serviceLabel: z.string().max(200).optional(),
  description:  z.string().max(500).optional(),
  quantity:     z.number().positive(),
  unitPrice:    z.number().nonnegative(),
})

const UpdateInvoiceSchema = z.object({
  status:        z.enum(['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
  lineItems:     z.array(LineItemSchema).min(1).max(100).optional(),
  dueAt:         z.string().datetime().optional(),
  notes:         z.string().max(2000).optional(),
  reference:     z.string().max(100).optional(),
  vatRate:       z.number().min(0).max(1).optional(),
  bankAccountId: z.string().max(100).nullable().optional(),
}).strict()

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
      include: {
        client:      { select: { firstName: true, lastName: true, email: true, phone: true, idNumber: true } },
        case:        { select: { fileNumber: true, acquisitionType: true } },
        project:     { select: { id: true, name: true } },
        createdBy:   { select: { firstName: true, lastName: true } },
        bankAccount: { select: { id: true, bankName: true, accountName: true, accountNumber: true, branchCode: true, accountType: true } },
      },
    })

    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(invoice)
  } catch (err) {
    logger.error('[GET /api/finance/invoices/[id]]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function PATCH(
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

  const parsed = UpdateInvoiceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const existing = await prisma.invoice.findUnique({ where: { id }, select: { status: true, subtotal: true, vatRate: true, type: true, caseId: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (existing.status === 'PAID' || existing.status === 'CANCELLED' || existing.status === 'CONVERTED') {
      return NextResponse.json({ error: `Cannot modify a ${existing.status} invoice/quote` }, { status: 409 })
    }

    const isAdmin = session.user.isAdmin === true
    const isExecutive = session.user.isExecutive === true

    // Non-draft quotes/invoices can only be modified by Admins or Executives
    if (existing.status !== 'DRAFT' && !isAdmin && !isExecutive) {
      return NextResponse.json(
        { error: 'Only administrators and executives can edit an issued quote or invoice.' },
        { status: 403 }
      )
    }

    const input = parsed.data
    const updateData: Prisma.InvoiceUpdateInput = {}

    if (input.status !== undefined)    updateData.status    = input.status
    if (input.dueAt  !== undefined)    updateData.dueAt     = new Date(input.dueAt)
    if (input.notes  !== undefined)    updateData.notes     = input.notes
    if (input.reference !== undefined) updateData.reference = input.reference
    if ('bankAccountId' in input) {
      updateData.bankAccount = input.bankAccountId
        ? { connect: { id: input.bankAccountId } }
        : { disconnect: true }
    }

    if (input.lineItems) {
      const vatRate  = input.vatRate ?? Number(existing.vatRate) ?? 0.15
      const subtotal = input.lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
      updateData.lineItems = input.lineItems as Prisma.InputJsonValue
      updateData.subtotal  = subtotal
      updateData.vatRate   = vatRate
      updateData.vatAmount = subtotal * vatRate
      updateData.total     = subtotal + subtotal * vatRate
    } else if (input.vatRate !== undefined) {
      const sub = Number(existing.subtotal)
      updateData.vatRate   = input.vatRate
      updateData.vatAmount = sub * input.vatRate
      updateData.total     = sub + sub * input.vatRate
    }

    const updated = await prisma.invoice.update({ where: { id }, data: updateData })

    // Marking an invoice PAID may fulfil the case's accepted quote — advance
    // the case workflow (forward-only). Never fails the invoice update.
    if (input.status === 'PAID' && existing.type === 'INVOICE') {
      await checkQuoteFulfilmentSafe(existing.caseId, session.user.id)
    }

    return NextResponse.json(updated)
  } catch (err) {
    logger.error('[PATCH /api/finance/invoices/[id]]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  try {
    const existing = await prisma.invoice.findUnique({ where: { id }, select: { status: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (existing.status !== 'DRAFT') {
      return NextResponse.json({ error: 'Only DRAFT invoices can be deleted' }, { status: 409 })
    }

    await prisma.invoice.delete({ where: { id } })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    logger.error('[DELETE /api/finance/invoices/[id]]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
