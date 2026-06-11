import { logger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'

/**
 * Invoice register stats. Quotations (type = QUOTE) are excluded everywhere —
 * a quote is an offer, not a receivable. Collection figures come from payments
 * allocated to invoices; invoices marked PAID before payment allocation
 * existed (no linked payments) count as collected in full.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  try {
    const now           = new Date()
    const startOfMonth  = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLast   = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLast     = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

    const [
      activeInvoices,
      paymentSums,
      thisMonthAgg,
      lastMonthAgg,
      monthly,
      revenueByType,
    ] = await Promise.all([
      prisma.invoice.findMany({
        where:  { type: 'INVOICE', status: { not: 'CANCELLED' } },
        select: { id: true, total: true, status: true } }),
      prisma.payment.groupBy({
        by:    ['invoiceId'],
        where: { invoiceId: { not: null }, status: { not: 'CANCELLED' } },
        _sum:  { amount: true } }),
      // This month invoiced
      prisma.invoice.aggregate({
        where: { type: 'INVOICE', issuedAt: { gte: startOfMonth }, status: { not: 'CANCELLED' } },
        _sum:  { total: true } }),
      // Last month invoiced (for % change)
      prisma.invoice.aggregate({
        where: { type: 'INVOICE', issuedAt: { gte: startOfLast, lte: endOfLast }, status: { not: 'CANCELLED' } },
        _sum:  { total: true } }),
      // Monthly breakdown (last 12 months) — raw SQL for date_trunc grouping
      prisma.$queryRaw<Array<{ month: string; invoiced: number; collected: number; count: number }>>`
        SELECT
          TO_CHAR(DATE_TRUNC('month', i."issuedAt"), 'Mon YYYY') AS month,
          SUM(i.total)::float AS invoiced,
          SUM(CASE WHEN i.status = 'PAID' THEN i.total ELSE COALESCE(p.paid, 0) END)::float AS collected,
          COUNT(*)::int AS count
        FROM "Invoice" i
        LEFT JOIN (
          SELECT "invoiceId", SUM(amount) AS paid
          FROM "Payment"
          WHERE "invoiceId" IS NOT NULL AND status != 'CANCELLED'
          GROUP BY "invoiceId"
        ) p ON p."invoiceId" = i.id
        WHERE i."issuedAt" >= NOW() - INTERVAL '12 months'
          AND i.status != 'CANCELLED'
          AND i.type = 'INVOICE'
        GROUP BY DATE_TRUNC('month', i."issuedAt")
        ORDER BY DATE_TRUNC('month', i."issuedAt") ASC
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
          AND i.type = 'INVOICE'
        GROUP BY COALESCE(c."acquisitionType", 'DIRECT')
        ORDER BY total DESC
      `,
    ])

    const paidByInvoice = new Map(
      paymentSums.map(p => [p.invoiceId as string, Number(p._sum.amount ?? 0)])
    )

    let totalInvoiced  = 0
    let totalCollected = 0
    let outstanding    = 0
    let overdueCount   = 0

    for (const inv of activeInvoices) {
      const total    = Number(inv.total)
      const recorded = paidByInvoice.get(inv.id) ?? 0
      // Legacy PAID invoices without allocated payments count as fully collected
      const paid = inv.status === 'PAID' ? Math.max(total, recorded) : recorded

      totalInvoiced  += total
      totalCollected += paid
      if (inv.status !== 'PAID' && inv.status !== 'DRAFT') {
        outstanding += Math.max(0, total - paid)
      }
      if (inv.status === 'OVERDUE') overdueCount += 1
    }

    const thisMonth   = Number(thisMonthAgg._sum.total  ?? 0)
    const lastMonth   = Number(lastMonthAgg._sum.total  ?? 0)
    const percentChange = lastMonth === 0
      ? (thisMonth > 0 ? 100 : 0)
      : Math.round(((thisMonth - lastMonth) / lastMonth) * 100)

    return NextResponse.json({
      totalInvoiced,
      totalCollected,
      outstanding,
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
