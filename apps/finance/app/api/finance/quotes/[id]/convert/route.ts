import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib'
import { prisma, Prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { randomUUID } from 'crypto'

const ConvertSchema = z.object({
  dueAt: z.string().datetime().optional(),
}).strict()

/**
 * Convert an ACCEPTED quotation into a real invoice. Copies line items and
 * totals, issues the next INV-YYYY-NNNN number, and links the two documents.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  // Same restriction as direct invoice creation
  const isAdmin     = session.user.isAdmin === true
  const isExecutive = session.user.isExecutive === true || (session.user as any)?.role?.toUpperCase() === 'EXECUTIVE'
  const isFinance   = (session.user as any)?.role?.toUpperCase() === 'FINANCE' || (session.user as any)?.userType?.toUpperCase() === 'FINANCE'
  if (!isAdmin && !isExecutive && !isFinance) {
    return NextResponse.json({ error: 'You are not permitted to create invoices.' }, { status: 403 })
  }

  let body: unknown = {}
  try {
    const text = await request.text()
    if (text) body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ConvertSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const quote = await prisma.invoice.findUnique({ where: { id } })
    if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (quote.type !== 'QUOTE') {
      return NextResponse.json({ error: 'Only quotations can be converted to invoices' }, { status: 409 })
    }
    if (quote.status === 'CONVERTED') {
      return NextResponse.json({ error: 'This quote has already been converted' }, { status: 409 })
    }
    if (quote.status !== 'ACCEPTED') {
      return NextResponse.json({ error: 'Only accepted quotes can be converted to invoices' }, { status: 409 })
    }

    // Invoices must carry banking details — fall back to the default account
    let bankAccountId = quote.bankAccountId
    if (!bankAccountId) {
      const defaultBank = await prisma.bankAccount.findFirst({ where: { isDefault: true, isActive: true } })
      if (!defaultBank) {
        return NextResponse.json({ error: 'Banking details are required for invoices and no default bank account is configured.' }, { status: 422 })
      }
      bankAccountId = defaultBank.id
    }

    const dueAt = parsed.data.dueAt
      ? new Date(parsed.data.dueAt)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    const year = new Date().getFullYear()

    const invoice = await prisma.$transaction(async (tx) => {
      const count = await tx.invoice.count({
        where: { invoiceNumber: { startsWith: `INV-${year}-` } } })
      const seq = String(count + 1).padStart(4, '0')

      const created = await tx.invoice.create({
        data: {
          invoiceNumber: `INV-${year}-${seq}`,
          type:          'INVOICE',
          publicToken:   randomUUID(),
          clientId:      quote.clientId,
          caseId:        quote.caseId,
          projectId:     quote.projectId,
          lineItems:     quote.lineItems as Prisma.InputJsonValue,
          subtotal:      quote.subtotal,
          vatRate:       quote.vatRate,
          vatAmount:     quote.vatAmount,
          total:         quote.total,
          dueAt,
          notes:         quote.notes,
          reference:     quote.reference ?? quote.invoiceNumber,
          bankAccountId,
          createdById:   session.user.id,
          status:        'DRAFT',
        },
      })

      await tx.invoice.update({
        where: { id: quote.id },
        data:  { status: 'CONVERTED', convertedToInvoiceId: created.id },
      })

      return created
    })

    return NextResponse.json(invoice, { status: 201 })
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Number conflict — please retry' }, { status: 409 })
    }
    logger.error('[POST /api/finance/quotes/[id]/convert]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
