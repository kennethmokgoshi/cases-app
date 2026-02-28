import { logger } from '@zenowethu/shared-lib';
import { NextResponse } from 'next/server'
import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { z } from 'zod'

const RateTableCreateSchema = z.object({
  creditorName: z.string().min(1),
  accountType: z.string().min(1),
  minRate: z.number().min(0).max(100),
  maxRate: z.number().min(0).max(100),
  avgRate: z.number().min(0).max(100),
  source: z.string().optional(),
  effectiveTo: z.string().datetime().optional().nullable() })

export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page       = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit      = 20
    const search     = searchParams.get('search') ?? ''
    const accountType = searchParams.get('accountType') ?? ''
    const isActiveStr = searchParams.get('isActive') ?? ''

    const where: Record<string, unknown> = {}
    if (search)      where.creditorName = { contains: search }
    if (accountType) where.accountType  = accountType
    if (isActiveStr === 'true')  where.isActive = true
    if (isActiveStr === 'false') where.isActive = false

    const [rates, total] = await Promise.all([
      prisma.creditLifeRateTable.findMany({
        where,
        orderBy: [{ isActive: 'desc' }, { creditorName: 'asc' }],
        skip: (page - 1) * limit,
        take: limit }),
      prisma.creditLifeRateTable.count({ where }),
    ])

    const [totalCount, activeCount] = await Promise.all([
      prisma.creditLifeRateTable.count(),
      prisma.creditLifeRateTable.count({ where: { isActive: true } }),
    ])

    const accountTypes = await prisma.creditLifeRateTable.findMany({
      select: { accountType: true },
      distinct: ['accountType'],
      orderBy: { accountType: 'asc' } })

    return NextResponse.json({
      rates,
      total,
      page,
      pages: Math.ceil(total / limit),
      meta: {
        total: totalCount,
        active: activeCount,
        inactive: totalCount - activeCount,
        accountTypes: accountTypes.map((r) => r.accountType) } })
  } catch (error) {
    logger.error('Error fetching rate tables:', error)
    return NextResponse.json({ error: 'Failed to fetch rate tables' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = RateTableCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 })
    }

    const { creditorName, accountType, minRate, maxRate, avgRate, source, effectiveTo } = parsed.data

    const rate = await prisma.creditLifeRateTable.create({
      data: {
        creditorName,
        accountType,
        minRate,
        maxRate,
        avgRate,
        source: source ?? null,
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        isActive: true } })

    return NextResponse.json(rate, { status: 201 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : ''
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'A rate for this creditor + account type combination already exists' }, { status: 409 })
    }
    logger.error('Error creating rate table entry:', error)
    return NextResponse.json({ error: 'Failed to create rate table entry' }, { status: 500 })
  }
}
