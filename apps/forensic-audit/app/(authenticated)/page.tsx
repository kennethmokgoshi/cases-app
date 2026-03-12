'use client'

import { useSession } from '@zenowethu/ui'
import { useEffect, useState } from 'react'
import Link from 'next/link'

const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

type AuditUser = { firstName: string | null; lastName: string | null; email: string | null }
type AuditCase = { id: string; fileNumber: string; client: { firstName: string; lastName: string } | null }
type RecentAudit = { id: string; status: string; recommendations: string | null; updatedAt: string; Case: AuditCase | null; User: AuditUser | null }
type RedFlag = { id: string; status: string; recommendations: string | null; updatedAt: string; Case: AuditCase | null }
type Stats = { total: number; requiresAction: number; reviewed: number }

const RISK_COLORS: Record<string, string> = {
  REQUIRES_ACTION: 'bg-red-500/20 text-red-400 border-red-500/30',
  REVIEWED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  PENDING: 'bg-gray-500/20 text-gray-400 border-gray-500/30' }

function parseRiskType(recommendations: string | null): string {
  if (!recommendations) return 'Flagged'
  if (recommendations.toLowerCase().includes('section 80') || recommendations.toLowerCase().includes('reckless')) return 'Reckless Lending'
  if (recommendations.toLowerCase().includes('prescription') || recommendations.toLowerCase().includes('prescribed')) return 'Prescription Risk'
  if (recommendations.toLowerCase().includes('interest')) return 'Interest Rate'
  if (recommendations.toLowerCase().includes('insurance') || recommendations.toLowerCase().includes('premium')) return 'Insurance Premium'
  return 'Compliance Risk'
}

const FLAG_COLORS: Record<string, string> = {
  'Reckless Lending': 'text-orange-500 bg-orange-950/20 border-orange-500/20',
  'Prescription Risk': 'text-red-500 bg-red-950/20 border-red-500/20',
  'Interest Rate': 'text-yellow-500 bg-yellow-950/20 border-yellow-500/20',
  'Insurance Premium': 'text-blue-500 bg-blue-950/20 border-blue-500/20',
  'Compliance Risk': 'text-purple-500 bg-purple-950/20 border-purple-500/20',
  'Flagged': 'text-red-500 bg-red-950/20 border-red-500/20' }

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function ForensicDashboard() {
  const { data: session, status } = useSession()
  const [stats, setStats] = useState<Stats>({ total: 0, requiresAction: 0, reviewed: 0 })
  const [recentAudits, setRecentAudits] = useState<RecentAudit[]>([])
  const [redFlags, setRedFlags] = useState<RedFlag[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.userType === 'B2B_PARTNER') {
      window.location.href = window.location.hostname === 'localhost'
        ? 'http://localhost:3000/b2b-dashboard'
        : 'https://cases.zenowethu.co.za/b2b-dashboard'
    }
  }, [session, status])

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/dashboard/forensic-stats')
        if (res.ok) {
          const data = await res.json()
          setStats(data.stats)
          setRecentAudits(data.recentAudits)
          setRedFlags(data.redFlags)
        }
      } catch (err) {
        logger.error(err)
      } finally {
        setLoading(false)
      }
    }
    if (status === 'authenticated') fetchStats()
  }, [status])

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 text-white">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-end gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <span className="text-4xl">🕵️‍♂️</span>
            Forensic Evidence Board
          </h1>
          <p className="text-gray-400">
            Welcome, Auditor <span className="text-emerald-400 font-semibold">{session?.user?.lastName}</span>.
          </p>
        </div>
        <Link
          href="/cases/new"
          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors shadow-lg shadow-emerald-900/20 flex items-center gap-2"
        >
          <span>📂</span> New Investigation
        </Link>
      </div>

      {/* KPI Chips */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
          <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Total Audits</p>
          <p className="text-3xl font-bold text-white">
            {loading ? '—' : stats.total.toLocaleString()}
          </p>
        </div>
        <div className="bg-red-950/30 border border-red-900/40 rounded-xl p-5 text-center">
          <p className="text-red-400 text-xs uppercase tracking-wider mb-1">Requiring Action</p>
          <p className="text-3xl font-bold text-red-400">
            {loading ? '—' : stats.requiresAction.toLocaleString()}
          </p>
        </div>
        <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-xl p-5 text-center">
          <p className="text-emerald-400 text-xs uppercase tracking-wider mb-1">Reviewed</p>
          <p className="text-3xl font-bold text-emerald-400">
            {loading ? '—' : stats.reviewed.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Active Investigations (2/3 width) */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Active Investigations Panel */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col min-h-[320px]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold flex items-center gap-2 text-gray-200">
                <span>⚡</span> Recent Investigations
              </h3>
              <Link href="/cases" className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                View all →
              </Link>
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-400" />
              </div>
            ) : recentAudits.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-600">
                No audits run yet. Open a case and run the forensic audit.
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto">
                {recentAudits.map((audit) => (
                  <Link
                    key={audit.id}
                    href={`/cases/${audit.Case?.id ?? '#'}`}
                    className="block p-4 bg-gray-800/50 border border-gray-700 rounded-lg hover:border-emerald-500/50 transition-all group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-bold text-lg group-hover:text-emerald-400 transition-colors">
                          {audit.Case?.client
                            ? `${audit.Case.client.firstName} ${audit.Case.client.lastName}`
                            : 'Unknown Client'}
                        </h4>
                        <p className="text-xs font-mono text-gray-500">{audit.Case?.fileNumber ?? '—'}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${RISK_COLORS[audit.status] ?? 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                        {audit.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-3">
                      <span className="text-xs text-gray-500">
                        Auditor: {audit.User?.firstName ?? audit.User?.email ?? 'Unassigned'}
                      </span>
                      <span className="text-xs text-gray-600">{timeAgo(audit.updatedAt)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Compliance Quick Link */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-200">
              <span>📋</span> Compliance Actions
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <Link href="/compliance"
                className="p-4 bg-red-950/20 border border-red-500/20 rounded-lg hover:border-red-500/40 transition-colors">
                <p className="text-red-400 font-bold text-2xl">{loading ? '—' : stats.requiresAction}</p>
                <p className="text-xs text-gray-400 mt-1">Awaiting Resolution</p>
              </Link>
              <Link href="/compliance?status=REVIEWED"
                className="p-4 bg-emerald-950/20 border border-emerald-500/20 rounded-lg hover:border-emerald-500/40 transition-colors">
                <p className="text-emerald-400 font-bold text-2xl">{loading ? '—' : stats.reviewed}</p>
                <p className="text-xs text-gray-400 mt-1">Reviewed &amp; Actioned</p>
              </Link>
            </div>
          </div>
        </div>

        {/* Right Column: Red Flag Center (1/3 width) */}
        <div className="flex flex-col">
          <div className="bg-gray-900 border border-red-900/30 rounded-xl p-6 flex flex-col relative overflow-hidden flex-1 min-h-[400px]">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-50" />

            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold flex items-center gap-2 text-red-400">
                <span>🚩</span> Red Flag Center
              </h3>
              {!loading && stats.requiresAction > 0 && (
                <Link href="/compliance" className="text-xs text-red-400 hover:text-red-300 transition-colors">
                  View all →
                </Link>
              )}
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-400" />
              </div>
            ) : redFlags.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-center text-gray-600 text-sm">
                  No active red flags. All audits are clear.
                </p>
              </div>
            ) : (
              <div className="space-y-4 flex-1 overflow-y-auto">
                {redFlags.map((flag) => {
                  const riskType = parseRiskType(flag.recommendations)
                  const colorClass = FLAG_COLORS[riskType] ?? FLAG_COLORS['Flagged']
                  return (
                    <div key={flag.id} className={`p-4 rounded-lg border ${colorClass.split(' ').slice(1).join(' ')}`}>
                      <div className="flex justify-between items-start mb-2">
                        <span className={`text-xs font-bold uppercase tracking-wider ${colorClass.split(' ')[0]}`}>
                          {riskType}
                        </span>
                        <span className="text-xs text-gray-500">{timeAgo(flag.updatedAt)}</span>
                      </div>
                      <p className="text-sm text-gray-300 mb-2">
                        {flag.Case?.client
                          ? <><span className="text-white font-bold">{flag.Case.client.firstName} {flag.Case.client.lastName}</span> — {flag.Case.fileNumber}</>
                          : flag.Case?.fileNumber ?? 'Unknown case'
                        }
                      </p>
                      {flag.recommendations && (
                        <p className="text-xs text-gray-400 mb-3 line-clamp-2">{flag.recommendations}</p>
                      )}
                      <Link
                        href={`/cases/${flag.Case?.id ?? '#'}`}
                        className={`text-xs py-1 px-3 rounded border transition-colors ${colorClass.split(' ').slice(1).join(' ')} hover:opacity-80`}
                      >
                        View Case
                      </Link>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
