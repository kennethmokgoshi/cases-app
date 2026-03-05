'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'

const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

type CreditAccount = {
  id: string
  creditorName: string
  accountNumber: string | null
  accountType: string
  originalAmount: number | null
  outstandingBalance: number
  monthlyInstalment: number | null
  hasInsurance: boolean
  status: string
  isPrescribed: boolean
  isIncluded: boolean
  case: { fileNumber: string } | null
  client: { firstName: string; lastName: string; idNumber: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    'bg-emerald-500/20 text-emerald-400',
  CLOSED:    'bg-gray-500/20 text-gray-400',
  DISPUTED:  'bg-red-500/20 text-red-400',
  SETTLED:   'bg-blue-500/20 text-blue-400' }

function formatZAR(amount: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount)
}

function CreditAccountsContent() {
  const [accounts, setAccounts]   = useState<CreditAccount[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [pages, setPages]         = useState(1)
  const [loading, setLoading]     = useState(true)
  const [totalOutstanding, setTotalOutstanding] = useState(0)
  const [prescribedCount, setPrescribedCount]   = useState(0)

  const [search, setSearch]           = useState('')
  const [accountType, setAccountType] = useState('')
  const [status, setStatus]           = useState('')

  const fetchAccounts = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(pg))
      if (search)      params.set('search', search)
      if (accountType) params.set('accountType', accountType)
      if (status)      params.set('status', status)

      const res = await fetch(`/api/finance/credit-accounts?${params}`)
      if (res.ok) {
        const data = await res.json()
        setAccounts(data.accounts)
        setTotal(data.total)
        setPages(data.pages)
        setPage(pg)
      }
    } catch (err) {
      logger.error(err)
    } finally {
      setLoading(false)
    }
  }, [search, accountType, status])

  // Fetch aggregate stats on mount
  useEffect(() => {
    fetch('/api/finance/credit-accounts?limit=1000&page=1')
      .then(r => r.json())
      .then(data => {
        const all: CreditAccount[] = data.accounts || []
        setTotalOutstanding(all.reduce((sum, a) => sum + Number(a.outstandingBalance), 0))
        setPrescribedCount(all.filter(a => a.isPrescribed).length)
      })
      .catch(() => {})
  }, [])

  useEffect(() => { fetchAccounts(1) }, [fetchAccounts])

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <Link href="/" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block">
            ← Dashboard
          </Link>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Credit Accounts
          </h1>
          <p className="text-gray-400 text-sm mt-1">{total.toLocaleString()} total accounts</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">Total Accounts</h3>
          <p className="text-3xl font-bold text-white mt-2">{total.toLocaleString()}</p>
        </div>
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">Total Outstanding</h3>
          <p className="text-2xl font-bold text-white mt-2">{formatZAR(totalOutstanding)}</p>
        </div>
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">Prescribed</h3>
          <p className="text-3xl font-bold text-red-400 mt-2">{prescribedCount.toLocaleString()}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 mb-6 border border-white/5 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-gray-500 mb-1 block">Search</label>
          <input
            type="text"
            placeholder="Creditor, client name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchAccounts(1)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Account Type</label>
          <select
            value={accountType}
            onChange={(e) => setAccountType(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
          >
            <option value="">All Types</option>
            <option value="Home Loan">Home Loan</option>
            <option value="Vehicle">Vehicle</option>
            <option value="Credit Card">Credit Card</option>
            <option value="Personal Loan">Personal Loan</option>
            <option value="Overdraft">Overdraft</option>
            <option value="Store Account">Store Account</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="CLOSED">Closed</option>
            <option value="DISPUTED">Disputed</option>
            <option value="SETTLED">Settled</option>
          </select>
        </div>
        <button
          onClick={() => fetchAccounts(1)}
          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Filter
        </button>
        <button
          onClick={() => { setSearch(''); setAccountType(''); setStatus('') }}
          className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg text-sm transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Table */}
      <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <p className="text-lg mb-2">No credit accounts found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Creditor</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">Client</th>
                    <th className="px-5 py-3">File #</th>
                    <th className="px-5 py-3">Outstanding</th>
                    <th className="px-5 py-3">Monthly</th>
                    <th className="px-5 py-3">Insurance</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {accounts.map((a) => (
                    <tr key={a.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-white font-medium">{a.creditorName}</p>
                        {a.accountNumber && (
                          <p className="text-gray-500 text-xs font-mono">{a.accountNumber}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-400">{a.accountType}</td>
                      <td className="px-5 py-3">
                        {a.client ? (
                          <div>
                            <p className="text-white">{a.client.firstName} {a.client.lastName}</p>
                            <p className="text-gray-500 text-xs">{a.client.idNumber}</p>
                          </div>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-cyan-400 text-xs font-mono">
                        {a.case?.fileNumber ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-white font-semibold">
                        {formatZAR(Number(a.outstandingBalance))}
                      </td>
                      <td className="px-5 py-3 text-gray-300">
                        {a.monthlyInstalment != null ? formatZAR(Number(a.monthlyInstalment)) : '—'}
                      </td>
                      <td className="px-5 py-3">
                        {a.hasInsurance ? (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-400">Yes</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-500/20 text-gray-400">No</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[a.status] ?? 'bg-yellow-500/20 text-yellow-400'}`}>
                          {a.status}
                          {a.isPrescribed && ' ⚠'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <Link href={`/credit-accounts/${a.id}`} className="text-cyan-400 hover:text-cyan-300 text-xs">
                          View
                        </Link>
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
                  <button disabled={page <= 1} onClick={() => fetchAccounts(page - 1)}
                    className="px-3 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-white rounded text-xs transition-colors">
                    ← Prev
                  </button>
                  <button disabled={page >= pages} onClick={() => fetchAccounts(page + 1)}
                    className="px-3 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-white rounded text-xs transition-colors">
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function CreditAccountsPage() {
  return (
    <div className="p-6">
      <Suspense fallback={<div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" /></div>}>
        <CreditAccountsContent />
      </Suspense>
    </div>
  )
}
