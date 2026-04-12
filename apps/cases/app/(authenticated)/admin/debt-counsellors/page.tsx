'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from '@zenowethu/ui'
import { useRouter } from 'next/navigation'

type DCRecord = {
  ncrdcNo: string | null
  debtCounsellorName: string | null
  dcTradingName: string | null
  dcEmail: string | null
  lastKnownEmail: string | null
  dcMobile: string | null
  lastUsedMobile: string | null
  dcTel: string | null
  lastUsedTel: string | null
  dcOperatingStatus: string | null
  dcProvince: string | null
  caseCount: number
}

type EditState = {
  ncrdcNo: string
  debtCounsellorName: string
  dcTradingName: string
  dcEmail: string
  lastKnownEmail: string
  dcMobile: string
  lastUsedMobile: string
  dcTel: string
  lastUsedTel: string
  dcOperatingStatus: string
  dcProvince: string
}

const STATUS_COLORS: Record<string, string> = {
  Operating: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  Cancelled: 'bg-red-500/20 text-red-300 border-red-500/30',
  Suspended: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
}

function statusColor(status: string | null) {
  if (!status) return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  return STATUS_COLORS[status] ?? 'bg-gray-500/20 text-gray-400 border-gray-500/30'
}

function EditModal({
  record,
  onClose,
  onSaved,
}: {
  record: DCRecord
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<EditState>({
    ncrdcNo: record.ncrdcNo ?? '',
    debtCounsellorName: record.debtCounsellorName ?? '',
    dcTradingName: record.dcTradingName ?? '',
    dcEmail: record.dcEmail ?? '',
    lastKnownEmail: record.lastKnownEmail ?? '',
    dcMobile: record.dcMobile ?? '',
    lastUsedMobile: record.lastUsedMobile ?? '',
    dcTel: record.dcTel ?? '',
    lastUsedTel: record.lastUsedTel ?? '',
    dcOperatingStatus: record.dcOperatingStatus ?? '',
    dcProvince: record.dcProvince ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(field: keyof EditState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.ncrdcNo.trim()) {
      setError('NCRDC number is required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/debt-counsellors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Save failed.')
        return
      }
      onSaved()
      onClose()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, key: keyof EditState, hint?: string) => (
    <div>
      <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">
        {label}
      </label>
      <input
        type="text"
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        placeholder={hint}
        className="w-full bg-black/30 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-zeno-cyan/50"
      />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0e1117] border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-white">Edit Debt Counsellor</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Changes apply to all cases linked to this NCRDC number.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-5">
          {/* Identity */}
          <div>
            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-3">Identity</p>
            <div className="grid grid-cols-2 gap-3">
              {field('NCR Registration No', 'ncrdcNo', 'NCRDC0000')}
              {field('Full Name', 'debtCounsellorName', 'Firstname Lastname')}
              {field('Trading Name', 'dcTradingName', 'DebtBusters')}
              <div>
                <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">
                  Operating Status
                </label>
                <select
                  value={form.dcOperatingStatus}
                  onChange={(e) => set('dcOperatingStatus', e.target.value)}
                  className="w-full bg-black/30 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-zeno-cyan/50"
                >
                  <option value="">— Unknown —</option>
                  <option value="Operating">Operating</option>
                  <option value="Cancelled">Cancelled</option>
                  <option value="Suspended">Suspended</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">
                  Province
                </label>
                <select
                  value={form.dcProvince}
                  onChange={(e) => set('dcProvince', e.target.value)}
                  className="w-full bg-black/30 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-zeno-cyan/50"
                >
                  <option value="">— Unknown —</option>
                  <option value="Eastern Cape">Eastern Cape</option>
                  <option value="Free State">Free State</option>
                  <option value="Gauteng">Gauteng</option>
                  <option value="KwaZulu-Natal">KwaZulu-Natal</option>
                  <option value="Limpopo">Limpopo</option>
                  <option value="Mpumalanga">Mpumalanga</option>
                  <option value="Northern Cape">Northern Cape</option>
                  <option value="North West">North West</option>
                  <option value="Western Cape">Western Cape</option>
                </select>
              </div>
            </div>
          </div>

          {/* Contact */}
          <div>
            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-3">Contact Details</p>
            <div className="grid grid-cols-2 gap-3">
              {field('Tel', 'dcTel', '012 000 0000')}
              {field('Last Used Tel', 'lastUsedTel', 'Previously known tel')}
              {field('Mobile', 'dcMobile', '072 000 0000')}
              {field('Last Used Mobile', 'lastUsedMobile', 'Previously known mobile')}
              {field('Email', 'dcEmail', 'name@firm.co.za')}
              {field('Last Used Email', 'lastKnownEmail', 'Previously known email')}
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-zeno-cyan/20 border border-zeno-cyan/40 text-zeno-cyan rounded text-sm font-semibold hover:bg-zeno-cyan/30 transition-all disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function InfoCell({ label, value, sub }: { label: string; value: string | null; sub?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] text-gray-600 font-semibold uppercase tracking-wider truncate">{label}</p>
      <p className="text-xs text-white truncate mt-0.5">{value ?? <span className="text-gray-600 italic">—</span>}</p>
      {sub && (
        <p className="text-[10px] text-gray-500 truncate">prev: {sub}</p>
      )}
    </div>
  )
}

export default function DebtCounsellorVerificationPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [counsellors, setCounsellors] = useState<DCRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<DCRecord | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (status === 'authenticated' && !session?.user?.isAdmin) {
      router.push('/')
    }
  }, [session, status, router])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/debt-counsellors')
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setCounsellors(data.counsellors)
      setTotal(data.total)
    } catch {
      setError('Failed to load debt counsellors.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'authenticated') load()
  }, [status, load])

  const filtered = counsellors.filter((c) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      c.ncrdcNo?.toLowerCase().includes(q) ||
      c.debtCounsellorName?.toLowerCase().includes(q) ||
      c.dcTradingName?.toLowerCase().includes(q) ||
      c.dcEmail?.toLowerCase().includes(q) ||
      c.dcProvince?.toLowerCase().includes(q)
    )
  })

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-zeno-cyan" />
      </div>
    )
  }

  if (!session?.user?.isAdmin) return null

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Debt Counsellor Verification</h1>
          <p className="text-sm text-gray-400 mt-1">
            All debt counsellors the system has contacted — {total} on record
          </p>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search NCRDC, name, trading name, email…"
          className="w-full sm:w-80 bg-black/30 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-zeno-cyan/50"
        />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400" /> Operating
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-400" /> Cancelled
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400" /> Suspended
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-gray-600" /> Unknown
        </span>
        <span className="ml-auto text-gray-600 italic">
          &quot;Last Used&quot; = previous contact detail on record before it changed
        </span>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-zeno-cyan" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          {search ? 'No results for that search.' : 'No debt counsellors found.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((dc, i) => (
            <div
              key={dc.ncrdcNo ?? dc.dcEmail ?? i}
              className="bg-white/3 border border-gray-800 rounded-xl px-5 py-4 hover:border-gray-700 transition-colors"
            >
              {/* Top row: NCRDC + status badge + case count + edit button */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-mono font-bold text-zeno-cyan">
                    {dc.ncrdcNo ?? <span className="text-gray-600">No NCRDC</span>}
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${statusColor(dc.dcOperatingStatus)}`}
                  >
                    {dc.dcOperatingStatus ?? 'Unknown'}
                  </span>
                  <span className="text-[10px] text-gray-600">
                    {dc.caseCount} case{dc.caseCount !== 1 ? 's' : ''}
                  </span>
                </div>
                <button
                  onClick={() => setEditing(dc)}
                  className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-zeno-cyan transition-colors border border-gray-700 hover:border-zeno-cyan/40 rounded px-3 py-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.172-8.172z" />
                  </svg>
                  Edit
                </button>
              </div>

              {/* Detail grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <InfoCell label="Full Name" value={dc.debtCounsellorName} />
                <InfoCell label="Trading Name" value={dc.dcTradingName} />
                <InfoCell label="Province" value={dc.dcProvince} />
                <InfoCell label="Tel" value={dc.dcTel} sub={dc.lastUsedTel} />
                <InfoCell label="Mobile" value={dc.dcMobile} sub={dc.lastUsedMobile} />
                <InfoCell label="Email" value={dc.dcEmail} sub={dc.lastKnownEmail} />
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditModal
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
