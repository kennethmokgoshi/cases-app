import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'

/**
 * Quotation register stats. "Issued" means accepted by the client —
 * CONVERTED quotes were accepted first, so they count as issued too.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  try {
    const [issuedAgg, pendingAgg, rejectedAgg, convertedCount] = await Promise.all([
      prisma.invoice.aggregate({
        where: { type: 'QUOTE', status: { in: ['ACCEPTED', 'CONVERTED'] } },
        _sum: { total: true }, _count: true }),
      prisma.invoice.aggregate({
        where: { type: 'QUOTE', status: { in: ['DRAFT', 'SENT'] } },
        _sum: { total: true }, _count: true }),
      prisma.invoice.aggregate({
        where: { type: 'QUOTE', status: 'REJECTED' },
        _sum: { total: true }, _count: true }),
      prisma.invoice.count({ where: { type: 'QUOTE', status: 'CONVERTED' } }),
    ])

    const issued   = issuedAgg._count
    const rejected = rejectedAgg._count
    const decided  = issued + rejected

    return NextResponse.json({
      issuedCount:    issued,
      issuedValue:    Number(issuedAgg._sum.total ?? 0),
      pendingCount:   pendingAgg._count,
      pendingValue:   Number(pendingAgg._sum.total ?? 0),
      rejectedCount:  rejected,
      rejectedValue:  Number(rejectedAgg._sum.total ?? 0),
      convertedCount,
      acceptanceRate: decided > 0 ? Math.round((issued / decided) * 100) : null,
    })
  } catch (err) {
    logger.error('[GET /api/finance/quotes/stats]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
