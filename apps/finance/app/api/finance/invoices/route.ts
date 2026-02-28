import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib'
import { prisma, Prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const LineItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative() })

const CreateInvoiceSchema = z.object({
  clientId:  z.string().cuid().optional(),
  caseId:    z.string().cuid().optional(),
  projectId: z.string().cuid().optional(),
  lineItems: z.array(LineItemSchema).min(1).max(100),
  dueAt:     z.string().datetime(),
  notes:     z.string().max(2000).optional(),
  reference: z.string().max(100).optional(),
  vatRate:   z.number().min(0).max(1).default(0.15) })

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  const { searchParams } = new URL(request.url)
  const status    = searchParams.get('status')
  const clientId  = searchParams.get('clientId')
  const caseId    = searchParams.get('caseId')
  const from      = searchParams.get('from')
  const to        = searchParams.get('to')
  const search    = searchParams.get('search')
  const page      = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit     = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')))

  const where: Prisma.InvoiceWhereInput = {}

  if (status && ['DRAFT','SENT','PAID','OVERDUE','CANCELLED'].includes(status)) {
    where.status = status as Prisma.EnumInvoiceStatusFilter['equals']
  }
  if (clientId) where.clientId = clientId
  if (caseId)   where.caseId   = caseId

  if (from || to) {
    where.issuedAt = {}
    if (from) where.issuedAt.gte = new Date(from)
    if (to) {
      const d = new Date(to)
      d.setHours(23, 59, 59, 999)
      where.issuedAt.lte = d
    }
  }

  if (search) {
    where.OR = [
      { invoiceNumber: { contains: search, mode: 'insensitive' } },
      { reference:     { contains: search, mode: 'insensitive' } },
      { client: { firstName: { contains: search, mode: 'insensitive' } } },
      { client: { lastName:  { contains: search, mode: 'insensitive' } } },
    ]
  }

  try {
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { issuedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          client:    { select: { firstName: true, lastName: true, email: true, idNumber: true } },
          case:      { select: { fileNumber: true } },
          createdBy: { select: { firstName: true, lastName: true } } } }),
      prisma.invoice.count({ where }),
    ])

    return NextResponse.json({
      invoices,
      total,
      page,
      pages: Math.ceil(total / limit) })
  } catch (err) {
    logger.error('[GET /api/finance/invoices]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = CreateInvoiceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  const input = parsed.data
  const subtotal  = input.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const vatAmount = subtotal * input.vatRate
  const total     = subtotal + vatAmount
  const year      = new Date().getFullYear()

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      const count = await tx.invoice.count({
        where: { invoiceNumber: { startsWith: `INV-${year}-` } } })
      const seq = String(count + 1).padStart(4, '0')
      const invoiceNumber = `INV-${year}-${seq}`

      return tx.invoice.create({
        data: {
          invoiceNumber,
          clientId:   input.clientId  ?? null,
          caseId:     input.caseId    ?? null,
          projectId:  input.projectId ?? null,
          lineItems:  input.lineItems as Prisma.InputJsonValue,
          subtotal,
          vatRate:    input.vatRate,
          vatAmount,
          total,
          dueAt:      new Date(input.dueAt),
          notes:      input.notes     ?? null,
          reference:  input.reference ?? null,
          createdById: session.user.id,
          status:     'DRAFT' } })
    })

    return NextResponse.json(invoice, { status: 201 })
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Invoice number conflict — please retry' }, { status: 409 })
    }
    logger.error('[POST /api/finance/invoices]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
