import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  try {
    const now           = new Date()
    const startOfMonth  = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLast   = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLast     = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

    const [
      totalInvoicedAgg,
      totalCollectedAgg,
      outstandingAgg,
      overdueCount,
      thisMonthAgg,
      lastMonthAgg,
      monthly,
      revenueByType,
    ] = await Promise.all([
      // Total ever invoiced (all non-CANCELLED)
      prisma.invoice.aggregate({
        where: { status: { not: 'CANCELLED' } },
        _sum:  { total: true } }),
      // Total collected (PAID)
      prisma.invoice.aggregate({
        where: { status: 'PAID' },
        _sum:  { total: true } }),
      // Outstanding = SENT + OVERDUE
      prisma.invoice.aggregate({
        where: { status: { in: ['SENT', 'OVERDUE'] } },
        _sum:  { total: true } }),
      // Overdue count
      prisma.invoice.count({ where: { status: 'OVERDUE' } }),
      // This month invoiced
      prisma.invoice.aggregate({
        where: { issuedAt: { gte: startOfMonth }, status: { not: 'CANCELLED' } },
        _sum:  { total: true } }),
      // Last month invoiced (for % change)
      prisma.invoice.aggregate({
        where: { issuedAt: { gte: startOfLast, lte: endOfLast }, status: { not: 'CANCELLED' } },
        _sum:  { total: true } }),
      // Monthly breakdown (last 12 months)
      prisma.$queryRaw<Array<{ month: string; invoiced: number; collected: number; count: number }>>`
        SELECT
          TO_CHAR(DATE_TRUNC('month', "issuedAt"), 'Mon YYYY') AS month,
          SUM(total)::float AS invoiced,
          SUM(CASE WHEN status = 'PAID' THEN total ELSE 0 END)::float AS collected,
          COUNT(*)::int AS count
        FROM "Invoice"
        WHERE "issuedAt" >= NOW() - INTERVAL '12 months'
          AND status != 'CANCELLED'
        GROUP BY DATE_TRUNC('month', "issuedAt")
        ORDER BY DATE_TRUNC('month', "issuedAt") ASC
      `,
      // Revenue by acquisition type
      prisma.$queryRaw<Array<{ type: string; total: number; count: number }>>`
        SELECT
          COALESCE(c."acquisitionType", 'DIRECT') AS type,
          SUM(i.total)::float AS total,
          COUNT(*)::int AS count
        FROM "Invoice" i
        LEFT JOIN "Case" c ON i."caseId" = c.id
        WHERE i.status != 'CANCELLED'
        GROUP BY COALESCE(c."acquisitionType", 'DIRECT')
        ORDER BY total DESC
      `,
    ])

    const thisMonth   = Number(thisMonthAgg._sum.total  ?? 0)
    const lastMonth   = Number(lastMonthAgg._sum.total  ?? 0)
    const percentChange = lastMonth === 0
      ? (thisMonth > 0 ? 100 : 0)
      : Math.round(((thisMonth - lastMonth) / lastMonth) * 100)

    return NextResponse.json({
      totalInvoiced:  Number(totalInvoicedAgg._sum.total  ?? 0),
      totalCollected: Number(totalCollectedAgg._sum.total ?? 0),
      outstanding:    Number(outstandingAgg._sum.total    ?? 0),
      overdueCount,
      thisMonth,
      lastMonth,
      percentChange,
      monthly,
      revenueByType })
  } catch (err) {
    logger.error('[GET /api/finance/invoices/stats]', err)
    return NextResponse.json({
      totalInvoiced: 0,
      totalCollected: 0,
      outstanding: 0,
      overdueCount: 0,
      thisMonth: 0,
      lastMonth: 0,
      percentChange: 0,
      monthly: [],
      revenueByType: [] })
  }
}
