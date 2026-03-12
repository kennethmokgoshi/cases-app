'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'

const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

type LogEntry = {
  id: string
  notes: string
  createdAt: string
  case: { fileNumber: string } | null
  user: { name: string | null; email: string | null } | null
}

function AuditTrailContent() {
  const [logs, setLogs]       = useState<LogEntry[]>([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [pages, setPages]     = useState(1)
  const [loading, setLoading] = useState(true)

  const [search, setSearch]   = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]   = useState('')

  const fetchLogs = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(pg))
      if (search)   params.set('search', search)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo)   params.set('dateTo', dateTo)

      const res = await fetch(`/api/finance/audit-trail?${params}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs)
        setTotal(data.total)
        setPages(data.pages)
        setPage(pg)
      }
    } catch (err) {
      logger.error(err)
    } finally {
      setLoading(false)
    }
  }, [search, dateFrom, dateTo])

  useEffect(() => { fetchLogs(1) }, [fetchLogs])

  function exportCSV() {
    const rows = [
      ['Timestamp', 'User', 'Case File #', 'Action'],
      ...logs.map((l) => [
        new Date(l.createdAt).toISOString(),
        l.user?.name ?? l.user?.email ?? '',
        l.case?.fileNumber ?? '',
        l.notes.replace(/,/g, ';'),
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function extractAction(notes: string) {
    const match = notes.match(/\[([A-Z_]+)\]/)
    return match ? match[1].replace(/_/g, ' ') : notes.slice(0, 40)
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <Link href="/" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block">← Dashboard</Link>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Audit Trail
          </h1>
          <p className="text-gray-400 text-sm mt-1">{total.toLocaleString()} total entries</p>
        </div>
        <button onClick={exportCSV}
          className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg text-sm font-medium transition-colors">
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 mb-6 border border-white/5 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-gray-500 mb-1 block">Search</label>
          <input type="text" placeholder="Action, case, user..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchLogs(1)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Date From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none [color-scheme:dark]"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Date To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none [color-scheme:dark]"
          />
        </div>
        <button onClick={() => fetchLogs(1)}
          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg text-sm font-medium transition-colors">
          Filter
        </button>
        <button onClick={() => { setSearch(''); setDateFrom(''); setDateTo('') }}
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
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg mb-2">No audit log entries found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Timestamp</th>
                    <th className="px-5 py-3">User</th>
                    <th className="px-5 py-3">Case File #</th>
                    <th className="px-5 py-3">Action</th>
                    <th className="px-5 py-3">Full Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-5 py-3 text-gray-400 whitespace-nowrap text-xs">
                        {new Date(log.createdAt).toLocaleString('en-ZA')}
                      </td>
                      <td className="px-5 py-3 text-gray-300 text-xs">
                        {log.user?.name ?? log.user?.email ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-cyan-400 font-mono text-xs">
                        {log.case?.fileNumber ?? '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-white/5 text-gray-300">
                          {extractAction(log.notes)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs max-w-xs">
                        <span className="line-clamp-2">{log.notes}</span>
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
                  <button disabled={page <= 1} onClick={() => fetchLogs(page - 1)}
                    className="px-3 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-white rounded text-xs transition-colors">← Prev</button>
                  <button disabled={page >= pages} onClick={() => fetchLogs(page + 1)}
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

export default function AuditTrailPage() {
  return (
    <div className="p-6">
      <Suspense fallback={<div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" /></div>}>
        <AuditTrailContent />
      </Suspense>
    </div>
  )
}
