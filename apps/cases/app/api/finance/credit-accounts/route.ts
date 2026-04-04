import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib/src/auth';
import { prisma, Prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const CreditAccountCreateSchema = z.object({
  caseId: z.string().cuid(),
  clientId: z.string().cuid(),
  creditorName: z.string().min(1).max(200),
  accountNumber: z.string().max(100).optional(),
  accountType: z.string().min(1).max(100),
  originalAmount: z.number().nonnegative().optional(),
  outstandingBalance: z.number().nonnegative(),
  monthlyInstalment: z.number().nonnegative().optional(),
  interestRate: z.number().nonnegative().optional(),
  hasInsurance: z.boolean().default(false),
  insurerName: z.string().max(200).optional(),
  policyNumber: z.string().max(100).optional(),
  isIncluded: z.boolean().default(true) })

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  const { searchParams } = new URL(request.url)
  const search     = searchParams.get('search') || ''
  const status     = searchParams.get('status') || ''
  const accountType = searchParams.get('accountType') || ''
  const caseId     = searchParams.get('caseId') || ''
  const isPrescribed = searchParams.get('isPrescribed')
  const page       = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit      = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')))

  const where: any = {}

  if (status) where.status = status
  if (accountType) where.accountType = accountType
  if (caseId) where.caseId = caseId
  if (isPrescribed !== null && isPrescribed !== undefined) {
    where.isPrescribed = isPrescribed === 'true'
  }

  if (search) {
    where.OR = [
      { creditorName: { contains: search, mode: 'insensitive' } },
      { accountNumber: { contains: search, mode: 'insensitive' } },
      { client: { firstName: { contains: search, mode: 'insensitive' } } },
      { client: { lastName: { contains: search, mode: 'insensitive' } } },
      { client: { idNumber: { contains: search, mode: 'insensitive' } } },
    ]
  }

  try {
    const [accounts, total] = await Promise.all([
      prisma.creditAccount.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          case:   { select: { fileNumber: true } } } }),
      prisma.creditAccount.count({ where }),
    ])

    return NextResponse.json({ accounts, total, page, pages: Math.ceil(total / limit) })
  } catch (err) {
    logger.error('[GET /api/finance/credit-accounts]', err)
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

  const parsed = CreditAccountCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  const input = parsed.data

  try {
    const account = await prisma.creditAccount.create({
      data: {
        caseId:            input.caseId,
        clientId:          input.clientId,
        creditorName:      input.creditorName,
        accountNumber:     input.accountNumber ?? null,
        accountType:       input.accountType,
        originalAmount:    input.originalAmount ?? null,
        outstandingBalance: input.outstandingBalance,
        monthlyInstalment: input.monthlyInstalment ?? null,
        interestRate:      input.interestRate ?? null,
        hasInsurance:      input.hasInsurance,
        insurerName:       input.insurerName ?? null,
        policyNumber:      input.policyNumber ?? null,
        isIncluded:        input.isIncluded,
        status:            'ACTIVE',
        isPrescribed:      false,
        premiumSource:     'NOT_SET',
        premiumConfidence: 'LOW' } })

    await prisma.workflowLog.create({
      data: {
        caseId: input.caseId,
        notes:  `[CREDIT_ACCOUNT_CREATED] Added credit account: ${input.creditorName} (${input.accountType})`,
        userId: session.user.id } as any })

    return NextResponse.json(account, { status: 201 })
  } catch (err) {
    logger.error('[POST /api/finance/credit-accounts]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
