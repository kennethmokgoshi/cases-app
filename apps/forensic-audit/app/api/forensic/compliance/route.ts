import { logger } from '@zenowethu/shared-lib';
import { NextResponse } from 'next/server'
import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'

export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page    = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit   = 20
    const status  = searchParams.get('status') ?? ''
    const dateFrom = searchParams.get('dateFrom') ?? ''
    const dateTo   = searchParams.get('dateTo') ?? ''

    const where: Record<string, unknown> = {}

    if (status) {
      where.status = status
    } else {
      // Default: show audits that have been run (not pure PENDING)
      where.status = { in: ['REQUIRES_ACTION', 'REVIEWED', 'RESOLVED'] }
    }

    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {}
      if (dateFrom) dateFilter.gte = new Date(dateFrom)
      if (dateTo)   dateFilter.lte = new Date(dateTo + 'T23:59:59Z')
      where.updatedAt = dateFilter
    }

    const [audits, total] = await Promise.all([
      prisma.forensicAudit.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          Case: {
            include: {
              client: { select: { firstName: true, lastName: true } } } },
          User: { select: { firstName: true, lastName: true, email: true } },
          RecklessLendingAssessment: {
            select: { isReckless: true, availableSurplus: true } } } }),
      prisma.forensicAudit.count({ where }),
    ])

    const [requiresAction, reviewed] = await Promise.all([
      prisma.forensicAudit.count({ where: { status: 'REQUIRES_ACTION' } }),
      prisma.forensicAudit.count({ where: { status: 'REVIEWED' } }),
    ])

    return NextResponse.json({
      audits,
      total,
      page,
      pages: Math.ceil(total / limit),
      stats: { requiresAction, reviewed, total: requiresAction + reviewed } })
  } catch (error) {
    logger.error('Error fetching compliance audits:', error)
    return NextResponse.json({ error: 'Failed to fetch compliance data' }, { status: 500 })
  }
}
