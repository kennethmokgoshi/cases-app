'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'

const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

type LegalMatter = {
  id: string
  creditorName: string
  matterType: string
  status: string
  priority: string
  isPrescribed: boolean
  outstandingBalance: number | null
  createdAt: string
  Case: { fileNumber: string } | null
}

type LegalStats = { open: number; prescribed: number; highPriority: number }

const PRIORITY_COLORS: Record<string, string> = {
  HIGH:   'bg-red-500/20 text-red-400',
  MEDIUM: 'bg-yellow-500/20 text-yellow-400',
  LOW:    'bg-gray-500/20 text-gray-400' }

function formatZAR(amount: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount)
}

function ComplianceContent() {
  const [stats, setStats]               = useState<LegalStats>({ open: 0, prescribed: 0, highPriority: 0 })
  const [highPriorityMatters, setHighPriorityMatters] = useState<LegalMatter[]>([])
  const [matterTypeBreakdown, setMatterTypeBreakdown] = useState<Record<string, number>>({})
  const [loading, setLoading]           = useState(true)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        // Fetch all matters for stats and breakdown
        const [allRes, highPriorityRes] = await Promise.all([
          fetch('/api/finance/legal-matters?limit=100&page=1'),
          fetch('/api/finance/legal-matters?priority=HIGH&status=OPEN&limit=20&page=1'),
        ])

        if (allRes.ok) {
          const allData = await allRes.json()
          if (allData.stats) setStats(allData.stats)

          // Build matter type breakdown from fetched matters
          const breakdown: Record<string, number> = {}
          for (const m of (allData.matters as LegalMatter[])) {
            breakdown[m.matterType] = (breakdown[m.matterType] ?? 0) + 1
          }
          setMatterTypeBreakdown(breakdown)
        }

        if (highPriorityRes.ok) {
          const hpData = await highPriorityRes.json()
          setHighPriorityMatters(hpData.matters ?? [])
        }
      } catch (err) {
        logger.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const totalMatters = stats.open

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link href="/" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block">← Dashboard</Link>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
          Legal Compliance
        </h1>
        <p className="text-gray-400 text-sm mt-1">Overview of legal compliance status and risk indicators</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
              <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">Open Legal Matters</h3>
              <p className="text-3xl font-bold text-cyan-400 mt-2">{stats.open.toLocaleString()}</p>
              <p className="text-gray-500 text-xs mt-1">Active cases requiring attention</p>
            </div>
            <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
              <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">High Priority</h3>
              <p className="text-3xl font-bold text-red-400 mt-2">{stats.highPriority.toLocaleString()}</p>
              <p className="text-gray-500 text-xs mt-1">Urgent open matters</p>
            </div>
            <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
              <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">Prescribed Debts</h3>
              <p className="text-3xl font-bold text-yellow-400 mt-2">{stats.prescribed.toLocaleString()}</p>
              <p className="text-gray-500 text-xs mt-1">Potentially unenforceable debts</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Matter Type Breakdown */}
            <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 p-6">
              <h2 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">Matter Type Breakdown</h2>
              {Object.keys(matterTypeBreakdown).length === 0 ? (
                <p className="text-gray-500 text-sm">No matter type data available.</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(matterTypeBreakdown)
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count]) => {
                      const pct = totalMatters > 0 ? Math.round((count / (totalMatters || 1)) * 100) : 0
                      return (
                        <div key={type}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-400">{type.replace(/_/g, ' ')}</span>
                            <span className="text-white font-medium">{count}</span>
                          </div>
                          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full"
                              style={{ width: `${Math.max(2, pct)}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>

            {/* Recent High Priority Matters Table */}
            <div className="md:col-span-2 bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Recent High Priority Matters</h2>
                <Link href="/legal-matters?priority=HIGH&status=OPEN" className="text-cyan-400 hover:text-cyan-300 text-xs">
                  View all →
                </Link>
              </div>
              {highPriorityMatters.length === 0 ? (
                <div className="text-center py-10 text-gray-500 text-sm">No high priority matters found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-5 py-3">Case File #</th>
                        <th className="px-5 py-3">Creditor</th>
                        <th className="px-5 py-3">Type</th>
                        <th className="px-5 py-3">Priority</th>
                        <th className="px-5 py-3">Balance</th>
                        <th className="px-5 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {highPriorityMatters.map((m) => (
                        <tr key={m.id} className="hover:bg-white/5 transition-colors">
                          <td className="px-5 py-3 text-cyan-400 font-mono text-xs">{m.Case?.fileNumber ?? '—'}</td>
                          <td className="px-5 py-3 text-white font-medium">{m.creditorName}</td>
                          <td className="px-5 py-3 text-gray-400 text-xs">{m.matterType.replace(/_/g, ' ')}</td>
                          <td className="px-5 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[m.priority] ?? 'bg-gray-500/20 text-gray-400'}`}>
                              {m.priority}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-gray-300">
                            {m.outstandingBalance != null ? formatZAR(Number(m.outstandingBalance)) : '—'}
                          </td>
                          <td className="px-5 py-3">
                            <Link href={`/legal-matters/${m.id}`} className="text-cyan-400 hover:text-cyan-300 text-xs">View</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function CompliancePage() {
  return (
    <div className="p-6">
      <Suspense fallback={<div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" /></div>}>
        <ComplianceContent />
      </Suspense>
    </div>
  )
}
