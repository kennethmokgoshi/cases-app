import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib'
import { prisma, Prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const LineItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative() })

const UpdateInvoiceSchema = z.object({
  status:    z.enum(['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
  lineItems: z.array(LineItemSchema).min(1).max(100).optional(),
  dueAt:     z.string().datetime().optional(),
  notes:     z.string().max(2000).optional(),
  reference: z.string().max(100).optional(),
  vatRate:   z.number().min(0).max(1).optional() }).strict()

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
        client:    { select: { firstName: true, lastName: true, email: true, phone: true, idNumber: true, address: true } },
        case:      { select: { fileNumber: true, acquisitionType: true } },
        project:   { select: { id: true, name: true } },
        createdBy: { select: { firstName: true, lastName: true } } } })

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
  const { id } = await params;
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
    const existing = await prisma.invoice.findUnique({ where: { id }, select: { status: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (existing.status === 'PAID' || existing.status === 'CANCELLED') {
      return NextResponse.json({ error: `Cannot modify a ${existing.status} invoice` }, { status: 409 })
    }

    const input = parsed.data
    const updateData: any = {}

    if (input.status)    updateData.status    = input.status
    if (input.dueAt)     updateData.dueAt     = new Date(input.dueAt)
    if (input.notes !== undefined) updateData.notes = input.notes
    if (input.reference !== undefined) updateData.reference = input.reference

    if (input.lineItems) {
      const vatRate  = input.vatRate ?? (existing as unknown as { vatRate: number }).vatRate ?? 0.15
      const subtotal = input.lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
      updateData.lineItems = input.lineItems as any
      updateData.subtotal  = subtotal
      updateData.vatRate   = vatRate
      updateData.vatAmount = subtotal * vatRate
      updateData.total     = subtotal + subtotal * vatRate
    } else if (input.vatRate !== undefined) {
      // vatRate changed without new lineItems — need to recalculate
      const inv = await prisma.invoice.findUnique({ where: { id }, select: { subtotal: true } })
      if (inv) {
        const sub = Number(inv.subtotal)
        updateData.vatRate   = input.vatRate
        updateData.vatAmount = sub * input.vatRate
        updateData.total     = sub + sub * input.vatRate
      }
    }

    const updated = await prisma.invoice.update({ where: { id }, data: updateData })
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
  const { id } = await params;
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
