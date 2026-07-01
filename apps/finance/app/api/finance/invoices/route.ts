import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib'
import { computeInvoiceActorRoles, createInvoiceForUser } from '@zenowethu/shared-lib/src/finance/create-invoice'
import { prisma, Prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const LineItemSchema = z.object({
  // Account+service format
  creditor:     z.string().max(200).optional(),
  serviceKey:   z.string().max(100).optional(),
  serviceLabel: z.string().max(200).optional(),
  // Legacy free-text format
  description:  z.string().max(500).optional(),
  quantity:     z.number().positive(),
  unitPrice:    z.number().nonnegative(),
}).refine(d => d.creditor || d.description, {
  message: 'Each line item must have either a creditor or a description',
})

const CreateInvoiceSchema = z.object({
  type:      z.enum(['INVOICE', 'QUOTE']).default('INVOICE'),
  clientId:  z.string().cuid().optional(),
  caseId:    z.string().cuid().optional(),
  projectId: z.string().cuid().optional(),
  lineItems: z.array(LineItemSchema).min(1).max(100),
  dueAt:     z.string().datetime(),
  notes:     z.string().max(2000).optional(),
  reference: z.string().max(100).optional(),
  vatRate:   z.number().min(0).max(1).default(0.15),
  bankAccountId: z.string().cuid().optional(),
  useOwnBanking: z.boolean().optional(),
})

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  const { searchParams } = new URL(request.url)
  const status    = searchParams.get('status')
  const type      = searchParams.get('type')
  const clientId  = searchParams.get('clientId')
  const caseId    = searchParams.get('caseId')
  const from      = searchParams.get('from')
  const to        = searchParams.get('to')
  const search    = searchParams.get('search')
  const page      = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit     = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')))

  const where: Prisma.InvoiceWhereInput = {}

  const VALID_STATUSES = ['DRAFT','SENT','ACCEPTED','REJECTED','CONVERTED','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED']
  if (status) {
    const statuses = status.split(',').filter(s => VALID_STATUSES.includes(s))
    if (statuses.length === 1) where.status = statuses[0] as Prisma.EnumInvoiceStatusFilter
    else if (statuses.length > 1) where.status = { in: statuses } as Prisma.EnumInvoiceStatusFilter
  }
  if (type && ['INVOICE','QUOTE'].includes(type)) {
    where.type = type as Prisma.EnumDocumentTypeFilter
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
    const [rows, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { issuedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          client:    { select: { id: true, firstName: true, lastName: true, email: true, idNumber: true } },
          case:      { select: { fileNumber: true } },
          createdBy: { select: { firstName: true, lastName: true } },
          decidedBy: { select: { firstName: true, lastName: true } },
          payments:  { select: { amount: true }, where: { status: { not: 'CANCELLED' } } } } }),
      prisma.invoice.count({ where }),
    ])

    const invoices = rows.map(({ payments, ...inv }) => {
      const recorded = payments.reduce((s, p) => s + Number(p.amount), 0)
      // Legacy invoices marked PAID before payment allocation existed have no
      // linked payments — treat them as fully collected.
      const amountPaid = inv.status === 'PAID' && recorded === 0 ? Number(inv.total) : recorded
      return {
        ...inv,
        amountPaid,
        balanceDue: inv.status === 'PAID' ? 0 : Math.max(0, Number(inv.total) - amountPaid),
      }
    })

    return NextResponse.json({ invoices, total, page, pages: Math.ceil(total / limit) })
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
  const roles = computeInvoiceActorRoles(session.user)

  try {
    const result = await createInvoiceForUser(input, roles, session.user.id)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.invoice, { status: 201 })
  } catch (err: unknown) {
    logger.error('[POST /api/finance/invoices]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
