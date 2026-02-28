import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib'
import { prisma, Prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  const { searchParams } = new URL(request.url)
  const search  = searchParams.get('search') || ''
  const userId  = searchParams.get('userId') || ''
  const from    = searchParams.get('from') || ''
  const to      = searchParams.get('to') || ''
  const page    = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit   = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')))

  const where: Prisma.WorkflowLogWhereInput = {}

  if (userId) where.userId = userId

  if (from || to) {
    where.timestamp = {}
    if (from) (where.timestamp as Prisma.DateTimeFilter).gte = new Date(from)
    if (to) {
      const d = new Date(to)
      d.setHours(23, 59, 59, 999)
      ;(where.timestamp as Prisma.DateTimeFilter).lte = d
    }
  }

  if (search) {
    where.OR = [
      { notes:   { contains: search, mode: 'insensitive' } },
      { action:  { contains: search, mode: 'insensitive' } },
      { case:    { fileNumber: { contains: search, mode: 'insensitive' } } },
    ]
  }

  try {
    const [logs, total] = await Promise.all([
      prisma.workflowLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          case: { select: { fileNumber: true } },
          user: { select: { firstName: true, lastName: true } } } }),
      prisma.workflowLog.count({ where }),
    ])

    return NextResponse.json({ logs, total, page, pages: Math.ceil(total / limit) })
  } catch (err) {
    logger.error('[GET /api/finance/audit-trail]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
