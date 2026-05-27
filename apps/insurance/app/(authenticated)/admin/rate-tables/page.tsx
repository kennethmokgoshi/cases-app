'use client'

import { confirm } from '@zenowethu/ui';

import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'

type RateEntry = {
  id: string
  creditorName: string
  accountType: string
  minRate: number
  maxRate: number
  avgRate: number
  source: string | null
  effectiveFrom: string
  effectiveTo: string | null
  isActive: boolean
}

type Meta = { total: number; active: number; inactive: number; accountTypes: string[] }

const ACCOUNT_TYPES = [
  'MORTGAGE_LOAN',
  'CREDIT_CARD',
  'PERSONAL_LOAN',
  'VEHICLE_FINANCE',
  'STORE_ACCOUNT',
  'OVERDRAFT',
  'SHORT_TERM_LOAN',
]

function RateModal({
  initial,
  onClose,
  onSave }: {
  initial: Partial<RateEntry> | null
  onClose: () => void
  onSave: () => void
}) {
  const isEdit = !!initial?.id
  const [form, setForm] = useState({
    creditorName: initial?.creditorName ?? '',
    accountType:  initial?.accountType  ?? '',
    minRate:      String(initial?.minRate ?? ''),
    maxRate:      String(initial?.maxRate ?? ''),
    avgRate:      String(initial?.avgRate ?? ''),
    source:       initial?.source       ?? '',
    effectiveTo:  initial?.effectiveTo ? initial.effectiveTo.slice(0, 10) : '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(field: string, val: string) {
    setForm((prev) => ({ ...prev, [field]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const body = {
        creditorName: form.creditorName,
        accountType:  form.accountType,
        minRate: parseFloat(form.minRate),
        maxRate: parseFloat(form.maxRate),
        avgRate: parseFloat(form.avgRate),
        source: form.source || null,
        effectiveTo: form.effectiveTo ? new Date(form.effectiveTo).toISOString() : null }
      const url = isEdit ? `/api/admin/rate-tables/${initial!.id}` : '/api/admin/rate-tables'
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body) })
      if (res.ok) {
        onSave()
        onClose()
      } else {
        const err = await res.json()
        setError(err.error ?? 'Save failed')
      }
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--color-bg-secondary)] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-white font-semibold text-lg">{isEdit ? 'Edit Rate Entry' : 'Add Rate Entry'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Creditor Name *</label>
              <input required value={form.creditorName} onChange={(e) => set('creditorName', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Account Type *</label>
              <select required value={form.accountType} onChange={(e) => set('accountType', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none">
                <option value="">Select type…</option>
                {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Min Rate % *</label>
              <input required type="number" step="0.01" min="0" max="100" value={form.minRate}
                onChange={(e) => set('minRate', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Max Rate % *</label>
              <input required type="number" step="0.01" min="0" max="100" value={form.maxRate}
                onChange={(e) => set('maxRate', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Avg Rate % *</label>
              <input required type="number" step="0.01" min="0" max="100" value={form.avgRate}
                onChange={(e) => set('avgRate', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Source</label>
              <input value={form.source} onChange={(e) => set('source', e.target.value)} placeholder="e.g. NCR 2024"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Effective To</label>
              <input type="date" value={form.effectiveTo} onChange={(e) => set('effectiveTo', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none [color-scheme:dark]" />
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex justify-end gap-3 pt-2 border-t border-white/10">
            <button type="button" onClick={onClose}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg text-sm transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Rate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RateTablesContent() {
  const [rates, setRates]         = useState<RateEntry[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [pages, setPages]         = useState(1)
  const [meta, setMeta]           = useState<Meta>({ total: 0, active: 0, inactive: 0, accountTypes: [] })
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [accountType, setAccType] = useState('')
  const [isActive, setIsActive]   = useState('')
  const [modal, setModal]         = useState<Partial<RateEntry> | null | false>(false)
  const [deleting, setDeleting]   = useState<string | null>(null)
  const [toggling, setToggling]   = useState<string | null>(null)

  const fetchRates = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(pg))
      if (search)      params.set('search', search)
      if (accountType) params.set('accountType', accountType)
      if (isActive)    params.set('isActive', isActive)
      const res = await fetch(`/api/admin/rate-tables?${params}`)
      if (res.ok) {
        const data = await res.json()
        setRates(data.rates)
        setTotal(data.total)
        setPages(data.pages)
        setPage(pg)
        if (data.meta) setMeta(data.meta)
      }
    } finally {
      setLoading(false)
    }
  }, [search, accountType, isActive])

  useEffect(() => { fetchRates(1) }, [fetchRates])

  async function toggleActive(rate: RateEntry) {
    setToggling(rate.id)
    try {
      const res = await fetch(`/api/admin/rate-tables/${rate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !rate.isActive }) })
      if (res.ok) fetchRates(page)
    } finally {
      setToggling(null)
    }
  }

  async function deleteRate(id: string) {
    if (!await confirm('Delete this rate entry? This cannot be undone.')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/admin/rate-tables/${id}`, { method: 'DELETE' })
      if (res.ok) fetchRates(page)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <Link href="/admin" className="text-emerald-400 hover:text-emerald-300 text-sm mb-2 inline-block">← Admin</Link>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Credit Life Rate Tables
          </h1>
          <p className="text-gray-400 text-sm mt-1">Insurance premium benchmarks used in forensic analysis</p>
        </div>
        <button onClick={() => setModal({})}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-sm font-medium transition-colors">
          + Add Rate
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-[var(--color-bg-secondary)] p-5 rounded-2xl border border-white/5">
          <p className="text-gray-400 text-xs uppercase tracking-wider">Total Entries</p>
          <p className="text-2xl font-bold text-white mt-2">{meta.total}</p>
        </div>
        <div className="bg-[var(--color-bg-secondary)] p-5 rounded-2xl border border-white/5">
          <p className="text-gray-400 text-xs uppercase tracking-wider">Active</p>
          <p className="text-2xl font-bold text-emerald-400 mt-2">{meta.active}</p>
        </div>
        <div className="bg-[var(--color-bg-secondary)] p-5 rounded-2xl border border-white/5">
          <p className="text-gray-400 text-xs uppercase tracking-wider">Inactive</p>
          <p className="text-2xl font-bold text-gray-400 mt-2">{meta.inactive}</p>
        </div>
        <div className="bg-[var(--color-bg-secondary)] p-5 rounded-2xl border border-white/5">
          <p className="text-gray-400 text-xs uppercase tracking-wider">Account Types</p>
          <p className="text-2xl font-bold text-cyan-400 mt-2">{meta.accountTypes.length}</p>
        </div>
      </div>

      <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 mb-6 border border-white/5 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs text-gray-500 mb-1 block">Search Creditor</label>
          <input type="text" placeholder="Creditor name…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchRates(1)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:border-emerald-500 focus:outline-none" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Account Type</label>
          <select value={accountType} onChange={(e) => setAccType(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none">
            <option value="">All Types</option>
            {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Status</label>
          <select value={isActive} onChange={(e) => setIsActive(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none">
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
        <button onClick={() => fetchRates(1)}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-sm font-medium transition-colors">
          Filter
        </button>
        <button onClick={() => { setSearch(''); setAccType(''); setIsActive('') }}
          className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg text-sm transition-colors">
          Clear
        </button>
      </div>

      <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" />
          </div>
        ) : rates.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg mb-2">No rate entries found</p>
            <button onClick={() => setModal({})} className="mt-4 text-emerald-400 hover:text-emerald-300 text-sm">
              + Add first rate
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Creditor</th>
                    <th className="px-5 py-3">Account Type</th>
                    <th className="px-5 py-3">Min %</th>
                    <th className="px-5 py-3">Max %</th>
                    <th className="px-5 py-3">Avg %</th>
                    <th className="px-5 py-3">Effective From</th>
                    <th className="px-5 py-3">Effective To</th>
                    <th className="px-5 py-3">Source</th>
                    <th className="px-5 py-3">Active</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {rates.map((rate) => (
                    <tr key={rate.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-5 py-3 text-white font-medium">{rate.creditorName}</td>
                      <td className="px-5 py-3 text-gray-400 text-xs">{rate.accountType.replace(/_/g, ' ')}</td>
                      <td className="px-5 py-3 text-gray-300">{Number(rate.minRate).toFixed(2)}%</td>
                      <td className="px-5 py-3 text-gray-300">{Number(rate.maxRate).toFixed(2)}%</td>
                      <td className="px-5 py-3 text-emerald-400 font-medium">{Number(rate.avgRate).toFixed(2)}%</td>
                      <td className="px-5 py-3 text-gray-400 text-xs">
                        {new Date(rate.effectiveFrom).toLocaleDateString('en-ZA')}
                      </td>
                      <td className="px-5 py-3 text-gray-400 text-xs">
                        {rate.effectiveTo ? new Date(rate.effectiveTo).toLocaleDateString('en-ZA') : '—'}
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{rate.source ?? '—'}</td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => toggleActive(rate)}
                          disabled={toggling === rate.id}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${rate.isActive ? 'bg-emerald-500' : 'bg-gray-700'}`}
                        >
                          <span className={`inline-block h-3 w-3 rounded-full bg-white transform transition-transform ${rate.isActive ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                      </td>
                      <td className="px-5 py-3 flex gap-2 items-center">
                        <button onClick={() => setModal(rate)} className="text-cyan-400 hover:text-cyan-300 text-xs">Edit</button>
                        <button onClick={() => deleteRate(rate.id)} disabled={deleting === rate.id}
                          className="text-red-400 hover:text-red-300 text-xs disabled:opacity-50">
                          {deleting === rate.id ? '…' : 'Del'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-white/5">
                <p className="text-xs text-gray-500">Page {page} of {pages} · {total} entries</p>
                <div className="flex gap-2">
                  <button disabled={page <= 1} onClick={() => fetchRates(page - 1)}
                    className="px-3 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-white rounded text-xs">← Prev</button>
                  <button disabled={page >= pages} onClick={() => fetchRates(page + 1)}
                    className="px-3 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-white rounded text-xs">Next →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {modal !== false && (
        <RateModal
          initial={modal === null ? null : modal}
          onClose={() => setModal(false)}
          onSave={() => fetchRates(page)}
        />
      )}
    </div>
  )
}

export default function RateTablesPage() {
  return (
    <div className="p-6">
      <Suspense fallback={<div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" /></div>}>
        <RateTablesContent />
      </Suspense>
    </div>
  )
}
