import { NextResponse } from 'next/server'
import { prisma } from '@zenowethu/database'
import { auth } from '@zenowethu/shared-lib'
import { logger } from '@zenowethu/shared-lib/src/logger'

// ─── GET /api/dccp/commission ─────────────────────────────────────────────────
// Query params:
//   month=current   — current calendar month (YYYY-MM)
//   month=YYYY-MM   — specific month
//   (omitted)       — returns all monthly summaries + per-policy records

export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    let monthParam = searchParams.get('month')

    if (monthParam === 'current') {
      const now = new Date()
      monthParam = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    }

    // Fetch monthly summaries from DB
    const summaries = await prisma.dCCPMonthlyCommissionSummary.findMany({
      ...(monthParam ? { where: { month: monthParam } } : {}),
      orderBy: { month: 'desc' },
    })

    // If no DB summaries exist, compute them live from commission records
    const dbMonths = summaries.map(s => ({
      month: s.month,
      totalPolicies: s.totalPolicies,
      cliPolicies: s.cliPolicies,
      aipPolicies: s.aipPolicies,
      funeralPolicies: s.funeralPolicies,
      totalPremium: Number(s.totalPremium),
      totalFee: Number(s.totalFee),
      isPaid: s.isPaid,
      paidAt: s.paidAt?.toISOString() ?? null,
    }))

    // If no pre-aggregated summaries, compute from DCCPCommissionRecord
    let months = dbMonths
    if (months.length === 0) {
      const rawRecords = await prisma.dCCPCommissionRecord.findMany({
        ...(monthParam ? { where: { month: monthParam } } : {}),
        orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
      })

      // Group by month
      const byMonth = new Map<string, typeof rawRecords>()
      for (const r of rawRecords) {
        if (!byMonth.has(r.month)) byMonth.set(r.month, [])
        byMonth.get(r.month)!.push(r)
      }

      months = Array.from(byMonth.entries()).map(([month, recs]) => ({
        month,
        totalPolicies: recs.length,
        cliPolicies: recs.filter(r => r.policyType === 'CLI').length,
        aipPolicies: recs.filter(r => r.policyType === 'AIP').length,
        funeralPolicies: recs.filter(r => r.policyType === 'FUNERAL').length,
        totalPremium: recs.reduce((s, r) => s + Number(r.retailPremium), 0),
        totalFee: recs.reduce((s, r) => s + Number(r.referralFee), 0),
        isPaid: recs.every(r => r.isPaid),
        paidAt: recs.find(r => r.paidAt)?.paidAt?.toISOString() ?? null,
      }))
    }

    // Also fetch if no pre-aggregated: compute from active policies for current month
    if (months.length === 0 && monthParam) {
      // Compute live from active DCCPPolicy for the requested month
      const now = new Date()
      const [year, mon] = (monthParam ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`).split('-').map(Number)
      const monthStart = new Date(year, mon - 1, 1)
      const monthEnd = new Date(year, mon, 0, 23, 59, 59)

      const activePolicies = await prisma.dCCPPolicy.findMany({
        where: {
          status: { in: ['ACTIVE', 'SUBMITTED'] },
          inceptionDate: { lte: monthEnd },
          OR: [
            { inceptionDate: { gte: monthStart } },
            { inceptionDate: { lt: monthStart } },
          ],
        },
        select: {
          policyType: true,
          retailPremium: true,
          referralFee: true,
        },
      })

      if (activePolicies.length > 0) {
        months = [{
          month: monthParam,
          totalPolicies: activePolicies.length,
          cliPolicies: activePolicies.filter(p => p.policyType === 'CLI').length,
          aipPolicies: activePolicies.filter(p => p.policyType === 'AIP').length,
          funeralPolicies: activePolicies.filter(p => p.policyType === 'FUNERAL').length,
          totalPremium: activePolicies.reduce((s, p) => s + Number(p.retailPremium), 0),
          totalFee: activePolicies.reduce((s, p) => s + Number(p.referralFee), 0),
          isPaid: false,
          paidAt: null,
        }]
      }
    }

    // Per-policy commission records for the requested month
    const records = await prisma.dCCPCommissionRecord.findMany({
      where: monthParam ? { month: monthParam } : {},
      orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
    })

    const formattedRecords = records.map(r => ({
      id: r.id,
      month: r.month,
      policyType: r.policyType,
      clientName: r.clientName,
      policyNumber: r.policyNumber,
      retailPremium: Number(r.retailPremium),
      referralFee: Number(r.referralFee),
      isPaid: r.isPaid,
      paidAt: r.paidAt?.toISOString() ?? null,
    }))

    // Stats for the requested month (or current if not specified)
    const targetMonth = monthParam ?? (() => {
      const now = new Date()
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    })()

    const current = months.find(m => m.month === targetMonth) ?? {
      month: targetMonth,
      totalPolicies: 0,
      cliPolicies: 0,
      aipPolicies: 0,
      funeralPolicies: 0,
      totalPremium: 0,
      totalFee: 0,
      isPaid: false,
      paidAt: null,
    }

    logger.info('[DCCP] Commission data fetched', { month: targetMonth, monthCount: months.length })

    return NextResponse.json({
      currentMonth: current,
      months,
      records: formattedRecords,
      // For dashboard compatibility
      currentMonthFee: current.totalFee,
      totalFeePaid: months.filter(m => m.isPaid).reduce((s, m) => s + m.totalFee, 0),
      totalFeePending: months.filter(m => !m.isPaid).reduce((s, m) => s + m.totalFee, 0),
    })
  } catch (error) {
    logger.error('[DCCP] GET /api/dccp/commission error', error)
    return NextResponse.json({ error: 'Failed to load commission data' }, { status: 500 })
  }
}
