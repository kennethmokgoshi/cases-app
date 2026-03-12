'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type MonthlyData = { month: string; invoiced: number; collected: number; count: number }
type TypeData    = { type: string; total: number; count: number }

type Stats = {
  totalInvoiced:  number
  totalCollected: number
  outstanding:    number
  overdueCount:   number
  thisMonth:      number
  lastMonth:      number
  percentChange:  number
  monthly:        MonthlyData[]
  revenueByType:  TypeData[]
}

function formatZAR(n: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(n)
}

function formatZARShort(n: number) {
  if (n >= 1_000_000) return `R ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `R ${(n / 1_000).toFixed(1)}K`
  return `R ${n.toFixed(0)}`
}

type QuarterlyData = { quarter: string; invoiced: number; collected: number; count: number }

function groupByQuarter(monthly: MonthlyData[]): QuarterlyData[] {
  const map = new Map<string, QuarterlyData>()
  for (const m of monthly) {
    // month is "Jan 2026" — parse it
    const d = new Date(`01 ${m.month}`)
    const q = Math.floor(d.getMonth() / 3) + 1
    const key = `Q${q} ${d.getFullYear()}`
    const prev = map.get(key) ?? { quarter: key, invoiced: 0, collected: 0, count: 0 }
    map.set(key, {
      quarter:   key,
      invoiced:  prev.invoiced  + m.invoiced,
      collected: prev.collected + m.collected,
      count:     prev.count     + m.count })
  }
  return Array.from(map.values())
}

export default function RevenuePage() {
  const [stats, setStats]       = useState<Stats | null>(null)
  const [loading, setLoading]   = useState(true)
  const [viewMode, setViewMode] = useState<'monthly' | 'quarterly'>('monthly')

  useEffect(() => {
    fetch('/api/finance/invoices/stats')
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const chartData = stats
    ? (viewMode === 'monthly'
        ? stats.monthly.map(m => ({ label: m.month, invoiced: m.invoiced, collected: m.collected, count: m.count }))
        : groupByQuarter(stats.monthly).map(q => ({ label: q.quarter, invoiced: q.invoiced, collected: q.collected, count: q.count })))
    : []

  const maxValue = chartData.length ? Math.max(...chartData.map(d => d.invoiced)) : 1

  const totalRevType = stats?.revenueByType.reduce((s, t) => s + t.total, 0) ?? 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Revenue
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Financial performance overview</p>
        </div>
        <Link
          href="/invoices"
          className="text-sm text-emerald-400 hover:underline flex items-center gap-1"
        >
          View Invoices →
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Total Invoiced</p>
          <p className="text-2xl font-bold text-white mt-1">{formatZARShort(stats?.totalInvoiced ?? 0)}</p>
          <p className="text-xs text-gray-600 mt-1">All time</p>
        </div>
        <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Collected</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{formatZARShort(stats?.totalCollected ?? 0)}</p>
          <p className="text-xs text-gray-600 mt-1">Paid invoices</p>
        </div>
        <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Outstanding</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">{formatZARShort(stats?.outstanding ?? 0)}</p>
          <p className="text-xs text-gray-600 mt-1">Sent + overdue</p>
        </div>
        <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Overdue</p>
          <p className="text-2xl font-bold text-red-400 mt-1">{stats?.overdueCount ?? 0}</p>
          <p className="text-xs text-gray-600 mt-1">
            This month: {formatZARShort(stats?.thisMonth ?? 0)}
            {(stats?.percentChange ?? 0) !== 0 && (
              <span className={`ml-1 ${(stats?.percentChange ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {(stats?.percentChange ?? 0) > 0 ? '↑' : '↓'}{Math.abs(stats?.percentChange ?? 0)}%
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Revenue Chart */}
      <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-white">Revenue Trend</h2>
          <div className="flex rounded-lg border border-white/10 overflow-hidden text-xs">
            {(['monthly', 'quarterly'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 capitalize transition-colors ${
                  viewMode === mode
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'text-gray-500 hover:text-white hover:bg-white/5'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="text-center py-10 text-gray-600 text-sm">No invoice data yet.</div>
        ) : (
          <div className="space-y-3">
            {chartData.map(row => (
              <div key={row.label} className="flex items-center gap-3">
                <div className="w-16 text-xs text-gray-500 text-right shrink-0">{row.label}</div>
                <div className="flex-1 flex flex-col gap-1">
                  {/* Invoiced bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full"
                        style={{ width: `${Math.max(1, (row.invoiced / maxValue) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-20 text-right">{formatZARShort(row.invoiced)}</span>
                  </div>
                  {/* Collected bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500/60 to-cyan-400/60 rounded-full"
                        style={{ width: `${Math.max(0, (row.collected / maxValue) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-600 w-20 text-right">{formatZARShort(row.collected)}</span>
                  </div>
                </div>
                <div className="w-8 text-xs text-gray-600 text-right">{row.count}</div>
              </div>
            ))}
          </div>
        )}

        {chartData.length > 0 && (
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/5">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className="w-3 h-1.5 bg-emerald-400 rounded-full" />
              Invoiced
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className="w-3 h-1.5 bg-cyan-400/60 rounded-full" />
              Collected
            </div>
          </div>
        )}
      </div>

      {/* Revenue by Type + Breakdown Table — side by side on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Revenue by type */}
        <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Revenue by Type</h2>
          {(stats?.revenueByType ?? []).length === 0 ? (
            <p className="text-sm text-gray-600">No data</p>
          ) : (
            <div className="space-y-4">
              {(stats?.revenueByType ?? []).map(t => {
                const pct = totalRevType > 0 ? Math.round((t.total / totalRevType) * 100) : 0
                return (
                  <div key={t.type}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-400">{t.type}</span>
                      <span className="text-white font-medium">{pct}%</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-600 mt-1">
                      <span>{t.count} invoice{t.count !== 1 ? 's' : ''}</span>
                      <span>{formatZARShort(t.total)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Monthly breakdown table */}
        <div className="md:col-span-2 bg-[var(--color-bg-secondary)] rounded-xl border border-white/5 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5">
            <h2 className="text-sm font-semibold text-white">Monthly Breakdown</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Period</th>
                  <th className="px-4 py-3 text-right">Invoiced</th>
                  <th className="px-4 py-3 text-right">Collected</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                  <th className="px-4 py-3 text-right"># Invoices</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(stats?.monthly ?? []).slice().reverse().map(row => (
                  <tr key={row.month} className="hover:bg-white/3 transition-colors">
                    <td className="px-4 py-2.5 text-gray-300">{row.month}</td>
                    <td className="px-4 py-2.5 text-right text-white font-medium">{formatZAR(row.invoiced)}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-400">{formatZAR(row.collected)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{formatZAR(row.invoiced - row.collected)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{row.count}</td>
                  </tr>
                ))}
                {(stats?.monthly ?? []).length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-600 text-sm">No invoice data yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
