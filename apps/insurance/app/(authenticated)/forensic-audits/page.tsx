'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'

const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

type ForensicAudit = {
  id: string
  status: string
  findings: string | null
  recommendations: string | null
  createdAt: string
  completedAt: string | null
  Case: { fileNumber: string } | null
  User: { name: string | null; email: string | null } | null
}

type AuditStats = { total: number; pending: number; inProgress: number; completed: number }

const STATUS_COLORS: Record<string, string> = {
  PENDING:     'bg-yellow-500/20 text-yellow-400',
  IN_PROGRESS: 'bg-cyan-500/20 text-cyan-400',
  COMPLETED:   'bg-emerald-500/20 text-emerald-400' }

function ForensicAuditsContent() {
  const [audits, setAudits]   = useState<ForensicAudit[]>([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [pages, setPages]     = useState(1)
  const [loading, setLoading] = useState(true)
  const [stats, setStats]     = useState<AuditStats>({ total: 0, pending: 0, inProgress: 0, completed: 0 })

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  const fetchAudits = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(pg))
      if (search) params.set('search', search)
      if (status) params.set('status', status)

      const res = await fetch(`/api/finance/forensic-audits?${params}`)
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
  }, [search, status])

  useEffect(() => { fetchAudits(1) }, [fetchAudits])

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <Link href="/" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block">← Dashboard</Link>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Forensic Audits
          </h1>
          <p className="text-gray-400 text-sm mt-1">{total.toLocaleString()} total records</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-[var(--color-bg-secondary)] p-5 rounded-2xl border border-white/5">
          <h3 className="text-gray-400 text-xs uppercase tracking-wider">Total</h3>
          <p className="text-2xl font-bold text-white mt-2">{stats.total.toLocaleString()}</p>
        </div>
        <div className="bg-[var(--color-bg-secondary)] p-5 rounded-2xl border border-white/5">
          <h3 className="text-gray-400 text-xs uppercase tracking-wider">Pending</h3>
          <p className="text-2xl font-bold text-yellow-400 mt-2">{stats.pending.toLocaleString()}</p>
        </div>
        <div className="bg-[var(--color-bg-secondary)] p-5 rounded-2xl border border-white/5">
          <h3 className="text-gray-400 text-xs uppercase tracking-wider">In Progress</h3>
          <p className="text-2xl font-bold text-cyan-400 mt-2">{stats.inProgress.toLocaleString()}</p>
        </div>
        <div className="bg-[var(--color-bg-secondary)] p-5 rounded-2xl border border-white/5">
          <h3 className="text-gray-400 text-xs uppercase tracking-wider">Completed</h3>
          <p className="text-2xl font-bold text-emerald-400 mt-2">{stats.completed.toLocaleString()}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 mb-6 border border-white/5 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-gray-500 mb-1 block">Search by Case File #</label>
          <input type="text" placeholder="File number..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchAudits(1)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none">
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>
        <button onClick={() => fetchAudits(1)}
          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg text-sm font-medium transition-colors">
          Filter
        </button>
        <button onClick={() => { setSearch(''); setStatus('') }}
          className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg text-sm transition-colors">
          Clear
        </button>
      </div>

      {/* Table */}
      <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
          </div>
        ) : audits.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg mb-2">No forensic audits found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Case File #</th>
                    <th className="px-5 py-3">Auditor</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Findings Preview</th>
                    <th className="px-5 py-3">Completed</th>
                    <th className="px-5 py-3">Created</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {audits.map((a) => (
                    <tr key={a.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-5 py-3 text-cyan-400 font-mono text-xs">{a.Case?.fileNumber ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-300">
                        {a.User?.name ?? a.User?.email ?? '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[a.status] ?? 'bg-gray-500/20 text-gray-400'}`}>
                          {a.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-400 max-w-xs">
                        {a.findings
                          ? <span className="line-clamp-1">{a.findings.slice(0, 80)}{a.findings.length > 80 ? '…' : ''}</span>
                          : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-5 py-3 text-gray-400 whitespace-nowrap">
                        {a.completedAt ? new Date(a.completedAt).toLocaleDateString('en-ZA') : '—'}
                      </td>
                      <td className="px-5 py-3 text-gray-400 whitespace-nowrap">
                        {new Date(a.createdAt).toLocaleDateString('en-ZA')}
                      </td>
                      <td className="px-5 py-3">
                        <Link href={`/forensic-audits/${a.id}`} className="text-cyan-400 hover:text-cyan-300 text-xs">View</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-white/5">
                <p className="text-xs text-gray-500">Page {page} of {pages}</p>
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
    </div>
  )
}

export default function ForensicAuditsPage() {
  return (
    <div className="p-6">
      <Suspense fallback={<div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" /></div>}>
        <ForensicAuditsContent />
      </Suspense>
    </div>
  )
}
