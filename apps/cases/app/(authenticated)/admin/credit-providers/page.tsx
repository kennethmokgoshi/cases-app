'use client'
import { confirm } from '@zenowethu/ui';


import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useSession } from '@zenowethu/ui'

type CreditProvider = {
  id: string
  name: string
  type: string
  email: string | null
  phone: string | null
  address: string | null
  attorney: string | null
  attorneyEmail: string | null
  attorneyPhone: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

type Meta = { total: number; active: number; inactive: number }

const PROVIDER_TYPES = ['BANK', 'MICRO_LENDER', 'TELECOM', 'RETAILER', 'OTHER'] as const
type ProviderType = typeof PROVIDER_TYPES[number]

const TYPE_LABELS: Record<ProviderType, string> = {
  BANK: 'Bank',
  MICRO_LENDER: 'Micro Lender',
  TELECOM: 'Telecom',
  RETAILER: 'Retailer',
  OTHER: 'Other',
}

const TYPE_COLORS: Record<ProviderType, string> = {
  BANK: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  MICRO_LENDER: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  TELECOM: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  RETAILER: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  OTHER: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
}

function ProviderModal({
  initial,
  onClose,
  onSave,
}: {
  initial: Partial<CreditProvider> | null
  onClose: () => void
  onSave: () => void
}) {
  const isEdit = !!initial?.id
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    type: initial?.type ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    address: initial?.address ?? '',
    attorney: initial?.attorney ?? '',
    attorneyEmail: initial?.attorneyEmail ?? '',
    attorneyPhone: initial?.attorneyPhone ?? '',
    isActive: initial?.isActive !== false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(field: string, val: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const body = {
        name: form.name,
        type: form.type,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        attorney: form.attorney || null,
        attorneyEmail: form.attorneyEmail || null,
        attorneyPhone: form.attorneyPhone || null,
        isActive: form.isActive,
      }
      const url = isEdit ? `/api/admin/credit-providers/${initial!.id}` : '/api/admin/credit-providers'
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
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
      <div className="bg-[var(--color-bg-secondary)] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 sticky top-0 bg-[var(--color-bg-secondary)] z-10">
          <h2 className="text-white font-semibold text-lg">
            {isEdit ? 'Edit Credit Provider' : 'Add Credit Provider'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-5">
          {/* Basic details */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Basic Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Provider Name *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="e.g. First National Bank"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Type *</label>
                <select
                  required
                  value={form.type}
                  onChange={(e) => set('type', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                >
                  <option value="">Select type…</option>
                  {PROVIDER_TYPES.map((t) => (
                    <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Email Address</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="debt@provider.co.za"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Phone</label>
                <input
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  placeholder="+27 11 000 0000"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="text-xs text-gray-500 mb-1 block">Physical Address</label>
              <textarea
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                placeholder="123 Main Street, Johannesburg, 2000"
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Attorney details */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Attorney / Legal Contact</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Attorney / Firm Name</label>
                <input
                  value={form.attorney}
                  onChange={(e) => set('attorney', e.target.value)}
                  placeholder="e.g. Smith & Associates Inc."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Attorney Phone</label>
                <input
                  value={form.attorneyPhone}
                  onChange={(e) => set('attorneyPhone', e.target.value)}
                  placeholder="+27 11 000 0000"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Attorney Email</label>
                <input
                  type="email"
                  value={form.attorneyEmail}
                  onChange={(e) => set('attorneyEmail', e.target.value)}
                  placeholder="attorney@lawfirm.co.za"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => set('isActive', !form.isActive)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${form.isActive ? 'bg-emerald-500' : 'bg-white/20'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm text-gray-300">Active provider</span>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex justify-end gap-3 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CreditProvidersContent() {
  const { data: session } = useSession()
  const [providers, setProviders] = useState<CreditProvider[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [pages, setPages]         = useState(1)
  const [meta, setMeta]           = useState<Meta>({ total: 0, active: 0, inactive: 0 })
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [modal, setModal]         = useState<Partial<CreditProvider> | null | false>(false)
  const [deleting, setDeleting]   = useState<string | null>(null)

  const canMutate = session?.user?.isAdmin || session?.user?.isExecutive || session?.user?.isSeniorManager
  const canDelete = session?.user?.isAdmin || session?.user?.isExecutive

  const fetchProviders = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(pg))
      if (search) params.set('search', search)
      if (typeFilter) params.set('type', typeFilter)
      if (activeFilter) params.set('isActive', activeFilter)
      const res = await fetch(`/api/admin/credit-providers?${params}`)
      if (res.ok) {
        const data = await res.json()
        setProviders(data.providers)
        setTotal(data.total)
        setPages(data.pages)
        setPage(pg)
        if (data.meta) setMeta(data.meta)
      }
    } finally {
      setLoading(false)
    }
  }, [search, typeFilter, activeFilter])

  useEffect(() => { fetchProviders(1) }, [fetchProviders])

  async function deleteProvider(p: CreditProvider) {
    if (!await confirm(`Delete "${p.name}"? This cannot be undone. Linked credit accounts will be unlinked.`)) return
    setDeleting(p.id)
    try {
      const res = await fetch(`/api/admin/credit-providers/${p.id}`, { method: 'DELETE' })
      if (res.ok) fetchProviders(page)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <Link href="/admin" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block">
            ← Admin
          </Link>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
            Credit Providers
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Global registry of credit providers — names, emails, and attorney contact details
          </p>
        </div>
        {canMutate && (
          <button
            onClick={() => setModal({})}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
          >
            + Add Provider
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-[var(--color-bg-secondary)] p-5 rounded-2xl border border-white/5">
          <p className="text-gray-400 text-xs uppercase tracking-wider">Total</p>
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
      </div>

      {/* Filters */}
      <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 mb-6 border border-white/5 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-gray-500 mb-1 block">Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name…"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <div className="min-w-[150px]">
          <label className="text-xs text-gray-500 mb-1 block">Type</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
          >
            <option value="">All types</option>
            {PROVIDER_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[130px]">
          <label className="text-xs text-gray-500 mb-1 block">Status</label>
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
          >
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
        <button
          onClick={() => { setSearch(''); setTypeFilter(''); setActiveFilter('') }}
          className="px-3 py-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg text-sm transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Table */}
      <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500" />
          </div>
        ) : providers.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🏦</div>
            <p className="text-gray-400">No credit providers found</p>
            {canMutate && (
              <button
                onClick={() => setModal({})}
                className="mt-4 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Add your first provider
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left">
                  <th className="px-6 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">Provider</th>
                  <th className="px-6 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">Attorney</th>
                  <th className="px-6 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">Status</th>
                  {canMutate && (
                    <th className="px-6 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider text-right">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {providers.map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-white font-medium">{p.name}</p>
                      {p.phone && <p className="text-gray-500 text-xs mt-0.5">{p.phone}</p>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${TYPE_COLORS[p.type as ProviderType] ?? 'bg-gray-500/20 text-gray-300 border-gray-500/30'}`}>
                        {TYPE_LABELS[p.type as ProviderType] ?? p.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {p.email ? (
                        <a href={`mailto:${p.email}`} className="text-cyan-400 hover:text-cyan-300 text-xs">
                          {p.email}
                        </a>
                      ) : (
                        <span className="text-amber-400 text-xs flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          Missing
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {p.attorney ? (
                        <div>
                          <p className="text-gray-300 text-xs">{p.attorney}</p>
                          {p.attorneyEmail && (
                            <a href={`mailto:${p.attorneyEmail}`} className="text-cyan-400/70 hover:text-cyan-400 text-xs">
                              {p.attorneyEmail}
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${p.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${p.isActive ? 'bg-emerald-400' : 'bg-gray-500'}`} />
                        {p.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {canMutate && (
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setModal(p)}
                            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg text-xs transition-colors"
                          >
                            Edit
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => deleteProvider(p)}
                              disabled={deleting === p.id}
                              className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs transition-colors disabled:opacity-50"
                            >
                              {deleting === p.id ? '…' : 'Delete'}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
          <span>{total} provider{total !== 1 ? 's' : ''}</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => fetchProviders(page - 1)}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg disabled:opacity-40 transition-colors"
            >
              ← Prev
            </button>
            <span className="px-3 py-1.5 text-gray-500">
              {page} / {pages}
            </span>
            <button
              disabled={page >= pages}
              onClick={() => fetchProviders(page + 1)}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg disabled:opacity-40 transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {modal !== false && (
        <ProviderModal
          initial={modal}
          onClose={() => setModal(false)}
          onSave={() => fetchProviders(page)}
        />
      )}
    </div>
  )
}

export default function CreditProvidersPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500" />
      </div>
    }>
      <CreditProvidersContent />
    </Suspense>
  )
}
