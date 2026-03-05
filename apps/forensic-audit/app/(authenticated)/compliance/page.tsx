'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'

const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

type AuditEntry = {
  id: string
  status: string
  recommendations: string | null
  findings: string | null
  createdAt: string
  updatedAt: string
  Case: {
    id: string
    fileNumber: string
    client: { firstName: string; lastName: string } | null
  } | null
  User: { firstName: string | null; lastName: string | null; email: string | null } | null
  RecklessLendingAssessment: { isReckless: boolean; availableSurplus: number | null } | null
}

type ComplianceStats = { requiresAction: number; reviewed: number; total: number }

const STATUS_COLORS: Record<string, string> = {
  REQUIRES_ACTION: 'bg-red-500/20 text-red-400',
  REVIEWED:        'bg-emerald-500/20 text-emerald-400',
  RESOLVED:        'bg-gray-500/20 text-gray-400',
  PENDING:         'bg-yellow-500/20 text-yellow-400' }

type RiskPill = { label: string; color: string }

function parseRiskPills(recommendations: string | null): RiskPill[] {
  if (!recommendations) return []
  const pills: RiskPill[] = []
  const r = recommendations.toLowerCase()
  if (r.includes('section 80') || r.includes('reckless')) pills.push({ label: 'Section 80', color: 'bg-orange-500/20 text-orange-400' })
  if (r.includes('prescription') || r.includes('prescribed')) pills.push({ label: 'Prescription', color: 'bg-red-500/20 text-red-400' })
  if (r.includes('interest')) pills.push({ label: 'Interest Rate', color: 'bg-yellow-500/20 text-yellow-400' })
  if (r.includes('insurance') || r.includes('premium')) pills.push({ label: 'Insurance', color: 'bg-blue-500/20 text-blue-400' })
  return pills
}

function ResolveModal({
  audit,
  onClose,
  onResolved }: {
  audit: AuditEntry
  onClose: () => void
  onResolved: () => void
}) {
  const [newStatus, setNewStatus] = useState<'REVIEWED' | 'RESOLVED'>('RESOLVED')
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/forensic/compliance/${audit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, notes }) })
      if (res.ok) {
        onResolved()
        onClose()
      } else {
        const err = await res.json()
        setError(err.error ?? 'Update failed')
      }
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  const client = audit.Case?.client
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--color-bg-secondary)] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-white font-semibold">Update Compliance Status</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="bg-white/5 rounded-lg p-3 text-sm">
            <p className="text-white font-medium">
              {client ? `${client.firstName} ${client.lastName}` : 'Unknown Client'}
            </p>
            <p className="text-gray-400 font-mono text-xs">{audit.Case?.fileNumber ?? '—'}</p>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">New Status</label>
            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as 'REVIEWED' | 'RESOLVED')}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none">
              <option value="REVIEWED">Reviewed</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Resolution Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="Describe actions taken or reason for status change…"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:border-emerald-500 focus:outline-none resize-none" />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/10">
          <button onClick={onClose} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg text-sm transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ComplianceContent() {
  const [audits, setAudits]     = useState<AuditEntry[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [pages, setPages]       = useState(1)
  const [loading, setLoading]   = useState(true)
  const [stats, setStats]       = useState<ComplianceStats>({ requiresAction: 0, reviewed: 0, total: 0 })
  const [status, setStatus]     = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [resolving, setResolving] = useState<AuditEntry | null>(null)

  const fetchAudits = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(pg))
      if (status)   params.set('status', status)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo)   params.set('dateTo', dateTo)

      const res = await fetch(`/api/forensic/compliance?${params}`)
      if (res.ok) {
        const data = await res.json()
        setAudits(data.audits)
        setTotal(data.total)
        setPages(data.pages)
        setPage(pg)
        if (data.stats) setStats(data.stats)
      }
    } catch (err) {
      logger.error(err)
    } finally {
      setLoading(false)
    }
  }, [status, dateFrom, dateTo])

  useEffect(() => { fetchAudits(1) }, [fetchAudits])

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <Link href="/" className="text-emerald-400 hover:text-emerald-300 text-sm mb-2 inline-block">← Dashboard</Link>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Compliance Actions
          </h1>
          <p className="text-gray-400 text-sm mt-1">Track and resolve forensic audit findings requiring action</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-red-950/20 border border-red-900/30 p-5 rounded-2xl">
          <h3 className="text-red-400 text-xs uppercase tracking-wider">Requiring Action</h3>
          <p className="text-3xl font-bold text-red-400 mt-2">{stats.requiresAction.toLocaleString()}</p>
          <p className="text-gray-500 text-xs mt-1">Active compliance issues</p>
        </div>
        <div className="bg-emerald-950/20 border border-emerald-900/30 p-5 rounded-2xl">
          <h3 className="text-emerald-400 text-xs uppercase tracking-wider">Reviewed</h3>
          <p className="text-3xl font-bold text-emerald-400 mt-2">{stats.reviewed.toLocaleString()}</p>
          <p className="text-gray-500 text-xs mt-1">Actioned &amp; logged</p>
        </div>
        <div className="bg-[var(--color-bg-secondary)] border border-white/5 p-5 rounded-2xl">
          <h3 className="text-gray-400 text-xs uppercase tracking-wider">Total Tracked</h3>
          <p className="text-3xl font-bold text-white mt-2">{stats.total.toLocaleString()}</p>
          <p className="text-gray-500 text-xs mt-1">All non-pending audits</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 mb-6 border border-white/5 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none">
            <option value="">All</option>
            <option value="REQUIRES_ACTION">Requires Action</option>
            <option value="REVIEWED">Reviewed</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Date From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none [color-scheme:dark]" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Date To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none [color-scheme:dark]" />
        </div>
        <button onClick={() => fetchAudits(1)}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-sm font-medium transition-colors">
          Filter
        </button>
        <button onClick={() => { setStatus(''); setDateFrom(''); setDateTo('') }}
          className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg text-sm transition-colors">
          Clear
        </button>
      </div>

      {/* Table */}
      <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" />
          </div>
        ) : audits.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg mb-2">No compliance records found</p>
            <p className="text-sm">Run forensic audits on cases to see compliance actions here.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Case File #</th>
                    <th className="px-5 py-3">Client</th>
                    <th className="px-5 py-3">Risk Indicators</th>
                    <th className="px-5 py-3">Recommendation</th>
                    <th className="px-5 py-3">Auditor</th>
                    <th className="px-5 py-3">Last Updated</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {audits.map((audit) => {
                    const pills = parseRiskPills(audit.recommendations)
                    const client = audit.Case?.client
                    return (
                      <tr key={audit.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-5 py-3 text-emerald-400 font-mono text-xs">
                          {audit.Case?.fileNumber ?? '—'}
                        </td>
                        <td className="px-5 py-3 text-white font-medium">
                          {client ? `${client.firstName} ${client.lastName}` : '—'}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap gap-1">
                            {pills.length > 0
                              ? pills.map((p) => (
                                  <span key={p.label} className={`px-2 py-0.5 rounded text-xs font-medium ${p.color}`}>
                                    {p.label}
                                  </span>
                                ))
                              : <span className="text-gray-600 text-xs">—</span>
                            }
                          </div>
                        </td>
                        <td className="px-5 py-3 text-gray-400 max-w-xs">
                          {audit.recommendations
                            ? <span className="line-clamp-2 text-xs">{audit.recommendations}</span>
                            : <span className="text-gray-600">—</span>
                          }
                        </td>
                        <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap">
                          {audit.User
                            ? (audit.User.firstName ?? audit.User.email ?? '—')
                            : '—'}
                        </td>
                        <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap">
                          {new Date(audit.updatedAt).toLocaleDateString('en-ZA')}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[audit.status] ?? 'bg-gray-500/20 text-gray-400'}`}>
                            {audit.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-5 py-3 flex gap-2 items-center whitespace-nowrap">
                          {audit.Case?.id && (
                            <Link href={`/cases/${audit.Case.id}`}
                              className="text-cyan-400 hover:text-cyan-300 text-xs">
                              View
                            </Link>
                          )}
                          {audit.status === 'REQUIRES_ACTION' && (
                            <button
                              onClick={() => setResolving(audit)}
                              className="text-emerald-400 hover:text-emerald-300 text-xs">
                              Resolve
                            </button>
                          )}
                          {audit.status !== 'REQUIRES_ACTION' && audit.status !== 'RESOLVED' && (
                            <button
                              onClick={() => setResolving(audit)}
                              className="text-gray-400 hover:text-white text-xs">
                              Update
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-white/5">
                <p className="text-xs text-gray-500">Page {page} of {pages} · {total} records</p>
                <div className="flex gap-2">
                  <button disabled={page <= 1} onClick={() => fetchAudits(page - 1)}
                    className="px-3 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-white rounded text-xs transition-colors">← Prev</button>
                  <button disabled={page >= pages} onClick={() => fetchAudits(page + 1)}
                    className="px-3 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-white rounded text-xs transition-colors">Next →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Resolve Modal */}
      {resolving && (
        <ResolveModal
          audit={resolving}
          onClose={() => setResolving(null)}
          onResolved={() => fetchAudits(page)}
        />
      )}
    </div>
  )
}

export default function CompliancePage() {
  return (
    <div className="p-6">
      <Suspense fallback={<div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" /></div>}>
        <ComplianceContent />
      </Suspense>
    </div>
  )
}
