import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib'
import { prisma, Prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const InsuranceAssessmentCreateSchema = z.object({
  caseId:               z.string().cuid(),
  clientId:             z.string().cuid(),
  totalCurrentPremium:  z.number().nonnegative(),
  totalAccounts:        z.number().int().nonnegative().default(0),
  replacementPremium:   z.number().nonnegative().optional(),
  monthlySavings:       z.number().optional(),
  annualSavings:        z.number().optional(),
  savingsPercent:       z.number().optional(),
  insurer:              z.string().max(200).optional() })

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  const { searchParams } = new URL(request.url)
  const status  = searchParams.get('status') || ''
  const caseId  = searchParams.get('caseId') || ''
  const search  = searchParams.get('search') || ''
  const page    = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit   = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')))

  const where: any = {}

  if (status && ['DRAFT','ACCEPTED','ISSUED','CANCELLED'].includes(status)) {
    where.status = status
  }
  if (caseId) where.caseId = caseId
  if (search) {
    where.Case = { fileNumber: { contains: search, mode: 'insensitive' } }
  }

  try {
    const [assessments, total, statsAgg, acceptedCount] = await Promise.all([
      prisma.insuranceAssessment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          Case:     { select: { fileNumber: true } },
          accounts: { select: { id: true } } } }),
      prisma.insuranceAssessment.count({ where }),
      prisma.insuranceAssessment.aggregate({
        _count: { id: true },
        _sum:   { monthlySavings: true },
        where:  { status: { not: 'CANCELLED' } } }),
      prisma.insuranceAssessment.count({ where: { status: 'ACCEPTED' } }),
    ])

    return NextResponse.json({
      assessments,
      total,
      page,
      pages: Math.ceil(total / limit),
      stats: {
        total:               statsAgg._count.id,
        accepted:            acceptedCount,
        totalMonthlySavings: Number(statsAgg._sum.monthlySavings ?? 0) } })
  } catch (err) {
    logger.error('[GET /api/finance/insurance-assessments]', err)
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

  const parsed = InsuranceAssessmentCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  const input = parsed.data

  try {
    const assessment = await prisma.insuranceAssessment.create({
      data: {
        caseId:              input.caseId,
        clientId:            input.clientId,
        totalCurrentPremium: input.totalCurrentPremium,
        totalAccounts:       input.totalAccounts,
        replacementPremium:  input.replacementPremium ?? null,
        monthlySavings:      input.monthlySavings ?? null,
        annualSavings:       input.annualSavings ?? null,
        savingsPercent:      input.savingsPercent ?? null,
        insurer:             input.insurer ?? null,
        status:              'DRAFT',
        consentGiven:        false,
        createdById:         session.user.id } })

    await prisma.workflowLog.create({
      data: {
        caseId: input.caseId,
        notes:  `[INSURANCE_ASSESSMENT_CREATED] Created insurance assessment`,
        userId: session.user.id } })

    return NextResponse.json(assessment, { status: 201 })
  } catch (err) {
    logger.error('[POST /api/finance/insurance-assessments]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
