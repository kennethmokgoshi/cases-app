import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib'
import { prisma, Prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const LegalMatterCreateSchema = z.object({
  caseId:          z.string().cuid(),
  clientId:        z.string().cuid(),
  matterType:      z.string().min(1).max(100),
  creditorName:    z.string().min(1).max(200),
  accountNumber:   z.string().max(100).optional(),
  originalAmount:  z.number().nonnegative().optional(),
  currentBalance:  z.number().nonnegative().optional(),
  priority:        z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  isPrescribed:    z.boolean().default(false),
  prescriptionDate: z.string().datetime().optional() })

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  const { searchParams } = new URL(request.url)
  const status      = searchParams.get('status') || ''
  const matterType  = searchParams.get('matterType') || ''
  const priority    = searchParams.get('priority') || ''
  const caseId      = searchParams.get('caseId') || ''
  const search      = searchParams.get('search') || ''
  const isPrescribed = searchParams.get('isPrescribed')
  const page        = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit       = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')))

  const where: Prisma.LegalMatterWhereInput = {}

  if (status && ['OPEN','CLOSED','SETTLED'].includes(status)) where.status = status
  if (matterType) where.matterType = matterType
  if (priority && ['LOW','MEDIUM','HIGH'].includes(priority)) where.priority = priority
  if (caseId) where.caseId = caseId
  if (isPrescribed !== null && isPrescribed !== undefined) {
    where.isPrescribed = isPrescribed === 'true'
  }

  if (search) {
    where.OR = [
      { creditorName: { contains: search, mode: 'insensitive' } },
      { accountNumber: { contains: search, mode: 'insensitive' } },
      { Client: { firstName: { contains: search, mode: 'insensitive' } } },
      { Client: { lastName: { contains: search, mode: 'insensitive' } } },
    ]
  }

  try {
    const [matters, total, openCount, prescribedCount, highPriorityCount] = await Promise.all([
      prisma.legalMatter.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          Case:   { select: { fileNumber: true } },
          Client: { select: { firstName: true, lastName: true, idNumber: true } } } }),
      prisma.legalMatter.count({ where }),
      prisma.legalMatter.count({ where: { status: 'OPEN' } }),
      prisma.legalMatter.count({ where: { isPrescribed: true } }),
      prisma.legalMatter.count({ where: { priority: 'HIGH', status: 'OPEN' } }),
    ])

    return NextResponse.json({
      matters,
      total,
      page,
      pages: Math.ceil(total / limit),
      stats: { open: openCount, prescribed: prescribedCount, highPriority: highPriorityCount } })
  } catch (err) {
    logger.error('[GET /api/finance/legal-matters]', err)
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

  const parsed = LegalMatterCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  const input = parsed.data

  try {
    const matter = await prisma.legalMatter.create({
      data: {
        caseId:          input.caseId,
        clientId:        input.clientId,
        matterType:      input.matterType,
        creditorName:    input.creditorName,
        accountNumber:   input.accountNumber ?? null,
        originalAmount:  input.originalAmount ?? null,
        currentBalance:  input.currentBalance ?? null,
        priority:        input.priority,
        isPrescribed:    input.isPrescribed,
        prescriptionDate: input.prescriptionDate ? new Date(input.prescriptionDate) : null,
        status:          'OPEN',
        letterSent:      false,
        responseReceived: false,
        createdById:     session.user.id } })

    await prisma.workflowLog.create({
      data: {
        caseId: input.caseId,
        notes:  `[LEGAL_MATTER_CREATED] Created legal matter: ${input.matterType} - ${input.creditorName}`,
        userId: session.user.id } })

    return NextResponse.json(matter, { status: 201 })
  } catch (err) {
    logger.error('[POST /api/finance/legal-matters]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
