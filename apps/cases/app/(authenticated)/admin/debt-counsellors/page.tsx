'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from '@zenowethu/ui'
import { useRouter } from 'next/navigation'

type DCStats = {
  total: number
  thisYear: number
  thisMonth: number
  lastMonth: number
  accepted: number
  declined: number
  topDeclineCategory: string | null
}

type DCRecord = {
  id: string
  ncrdcNo: string
  fullName: string | null
  tradingName: string | null
  operatingStatus: string | null
  province: string | null
  tel: string | null
  mobile: string | null
  email: string | null
  preferredEmail: string | null
  lastKnownEmail: string | null
  staffNotes: string | null
  updatedAt: string
  updatedBy: string | null
  stats: DCStats
}

type EditForm = {
  id: string
  ncrdcNo: string
  fullName: string
  tradingName: string
  operatingStatus: string
  province: string
  tel: string
  mobile: string
  fax: string
  email: string
  preferredEmail: string
  lastKnownEmail: string
  staffNotes: string
}

const STATUS_COLORS: Record<string, string> = {
  Operating: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  Cancelled: 'bg-red-500/20 text-red-300 border-red-500/30',
  Suspended: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
}

const DECLINE_LABELS: Record<string, string> = {
  SEND_DOCS: 'Docs Needed',
  SEND_DOCS_WITH_NCR: 'Docs + NCR Cert',
  CLIENT_CONSENT_NEEDED: 'Client Consent',
  OUTSTANDING_FEES: 'Outstanding Fees',
  CONTACT_ATTORNEY: 'Contact Attorney',
  RESUBMIT_LATER: 'Resubmit Later',
  UNKNOWN: 'Unknown',
}

function statusColor(s: string | null) {
  if (!s) return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  return STATUS_COLORS[s] ?? 'bg-gray-500/20 text-gray-400 border-gray-500/30'
}

function StatPill({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="flex flex-col items-center bg-black/20 rounded-lg px-3 py-2 min-w-[64px]">
      <span className={`text-base font-bold ${accent ?? 'text-white'}`}>{value}</span>
      <span className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5 text-center">{label}</span>
    </div>
  )
}

function EditModal({ record, onClose, onSaved }: { record: DCRecord; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<EditForm>({
    id: record.id,
    ncrdcNo: record.ncrdcNo,
    fullName: record.fullName ?? '',
    tradingName: record.tradingName ?? '',
    operatingStatus: record.operatingStatus ?? '',
    province: record.province ?? '',
    tel: record.tel ?? '',
    mobile: record.mobile ?? '',
    fax: '',
    email: record.email ?? '',
    preferredEmail: record.preferredEmail ?? '',
    lastKnownEmail: record.lastKnownEmail ?? '',
    staffNotes: record.staffNotes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(field: keyof EditForm, value: string) {
    setForm((p) => ({ ...p, [field]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
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

  const field = (label: string, key: keyof EditForm, hint?: string) => (
    <div>
      <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">{label}</label>
      <input
        type="text"
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        placeholder={hint}
        className="w-full bg-black/30 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
      />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0e1117] border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-white">Edit Debt Counsellor</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">{record.ncrdcNo} — changes sync to all linked cases</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-5">
          <div>
            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-3">Identity</p>
            <div className="grid grid-cols-2 gap-3">
              {field('NCR Registration No', 'ncrdcNo', 'NCRDC0000')}
              {field('Full Name', 'fullName', 'Firstname Lastname')}
              {field('Trading Name', 'tradingName', 'DebtBusters')}
              <div>
                <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Operating Status</label>
                <select value={form.operatingStatus} onChange={(e) => set('operatingStatus', e.target.value)}
                  className="w-full bg-black/30 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500/50">
                  <option value="">— Unknown —</option>
                  <option value="Operating">Operating</option>
                  <option value="Cancelled">Cancelled</option>
                  <option value="Suspended">Suspended</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Province</label>
                <select value={form.province} onChange={(e) => set('province', e.target.value)}
                  className="w-full bg-black/30 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500/50">
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

          <div>
            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-3">Contact Details</p>
            <div className="grid grid-cols-2 gap-3">
              {field('Tel', 'tel', '012 000 0000')}
              {field('Mobile', 'mobile', '072 000 0000')}
              {field('Fax', 'fax', '012 000 0000')}
              {field('Current Email', 'email', 'name@firm.co.za')}
              {field('Preferred Email', 'preferredEmail', 'Overrides all other email sources')}
              {field('Last Known Email', 'lastKnownEmail', 'Previously working email')}
            </div>
          </div>

          <div>
            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-3">Staff Notes</p>
            <textarea
              value={form.staffNotes}
              onChange={(e) => set('staffNotes', e.target.value)}
              rows={3}
              placeholder="Internal notes about this debt counsellor…"
              className="w-full bg-black/30 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50 resize-none"
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-800">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded text-sm font-semibold hover:bg-amber-500/30 transition-all disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function DebtCounsellorAdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [counsellors, setCounsellors] = useState<DCRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<DCRecord | null>(null)
  const [search, setSearch] = useState('')
  const [backfilling, setBackfilling] = useState(false)
  const [backfillMsg, setBackfillMsg] = useState('')

  useEffect(() => {
    if (status === 'authenticated' && !session?.user?.isAdmin) router.push('/')
  }, [session, status, router])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/debt-counsellors${search ? `?search=${encodeURIComponent(search)}` : ''}`)
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setCounsellors(data.counsellors)
      setTotal(data.total)
    } catch {
      setError('Failed to load debt counsellors.')
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    if (status === 'authenticated') load()
  }, [status, load])

  async function runBackfill() {
    setBackfilling(true)
    setBackfillMsg('')
    try {
      const res = await fetch('/api/admin/debt-counsellors/backfill', { method: 'POST' })
      const data = await res.json()
      setBackfillMsg(data.message ?? 'Done.')
      load()
    } catch {
      setBackfillMsg('Backfill failed — check logs.')
    } finally {
      setBackfilling(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-amber-500" />
      </div>
    )
  }
  if (!session?.user?.isAdmin) return null

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Debt Counsellors</h1>
          <p className="text-sm text-gray-400 mt-1">{total} counsellor{total !== 1 ? 's' : ''} on record</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search NCRDC, name, email…"
            className="w-full sm:w-72 bg-black/30 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
          />
          <button
            onClick={runBackfill}
            disabled={backfilling}
            className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg hover:border-gray-600 hover:text-white transition-all disabled:opacity-50 whitespace-nowrap"
          >
            {backfilling ? 'Backfilling…' : 'Backfill from Cases'}
          </button>
        </div>
      </div>

      {backfillMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-lg px-4 py-2.5 text-sm">{backfillMsg}</div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500" />
        </div>
      ) : counsellors.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          {search ? 'No results for that search.' : 'No debt counsellors found. Run "Backfill from Cases" to import existing data.'}
        </div>
      ) : (
        <div className="space-y-2">
          {counsellors.map((dc) => (
            <div key={dc.id} className="bg-white/3 border border-gray-800 rounded-xl px-5 py-4 hover:border-gray-700 transition-colors">
              {/* Top row */}
              <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-mono font-bold text-amber-400">{dc.ncrdcNo}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${statusColor(dc.operatingStatus)}`}>
                    {dc.operatingStatus ?? 'Unknown'}
                  </span>
                  {dc.province && <span className="text-[10px] text-gray-500">{dc.province}</span>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => router.push(`/admin/debt-counsellors/${dc.id}`)}
                    className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-amber-400 transition-colors border border-gray-700 hover:border-amber-500/40 rounded px-3 py-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    View
                  </button>
                  <button
                    onClick={() => setEditing(dc)}
                    className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-white transition-colors border border-gray-700 hover:border-gray-600 rounded px-3 py-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.172-8.172z" />
                    </svg>
                    Edit
                  </button>
                </div>
              </div>

              {/* Identity + contact */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
                <div className="min-w-0">
                  <p className="text-[9px] text-gray-600 font-semibold uppercase tracking-wider">Full Name</p>
                  <p className="text-xs text-white truncate mt-0.5">{dc.fullName ?? <span className="text-gray-600 italic">—</span>}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] text-gray-600 font-semibold uppercase tracking-wider">Trading Name</p>
                  <p className="text-xs text-white truncate mt-0.5">{dc.tradingName ?? <span className="text-gray-600 italic">—</span>}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] text-gray-600 font-semibold uppercase tracking-wider">Email</p>
                  <p className="text-xs text-white truncate mt-0.5">{dc.preferredEmail ?? dc.email ?? <span className="text-gray-600 italic">—</span>}</p>
                  {dc.preferredEmail && dc.email && dc.preferredEmail !== dc.email && (
                    <p className="text-[10px] text-gray-500 truncate">dhs: {dc.email}</p>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] text-gray-600 font-semibold uppercase tracking-wider">Tel / Mobile</p>
                  <p className="text-xs text-white truncate mt-0.5">{dc.tel ?? dc.mobile ?? <span className="text-gray-600 italic">—</span>}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] text-gray-600 font-semibold uppercase tracking-wider">Top Decline Reason</p>
                  <p className="text-xs text-amber-300 truncate mt-0.5">
                    {dc.stats.topDeclineCategory ? DECLINE_LABELS[dc.stats.topDeclineCategory] ?? dc.stats.topDeclineCategory : <span className="text-gray-600 italic">—</span>}
                  </p>
                </div>
              </div>

              {/* Stats pills */}
              <div className="flex gap-2 flex-wrap">
                <StatPill label="Total" value={dc.stats.total} />
                <StatPill label="This Year" value={dc.stats.thisYear} />
                <StatPill label="This Month" value={dc.stats.thisMonth} />
                <StatPill label="Last Month" value={dc.stats.lastMonth} />
                <StatPill label="Accepted" value={dc.stats.accepted} accent="text-emerald-400" />
                <StatPill label="Declined" value={dc.stats.declined} accent="text-red-400" />
                {dc.stats.total > 0 && (
                  <div className="flex flex-col items-center bg-black/20 rounded-lg px-3 py-2 min-w-[64px]">
                    <span className="text-base font-bold text-gray-300">
                      {Math.round((dc.stats.accepted / dc.stats.total) * 100)}%
                    </span>
                    <span className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5">Accept Rate</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditModal record={editing} onClose={() => setEditing(null)} onSaved={load} />
      )}
    </div>
  )
}
