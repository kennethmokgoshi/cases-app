'use client'

/**
 * Outstanding Fees (Finance) — raise a fee-recovery invoice or quotation TO a
 * debt counsellor for fees a consumer still owes Zenowethu (e.g. when that DC
 * requests a DHS transfer). Renders the shared `DcFeeInvoiceForm`; an optional
 * consumer search pre-fills + links the Zenowethu client record.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DcFeeInvoiceForm } from '@zenowethu/ui'

type ClientResult = {
  id: string
  firstName: string
  lastName: string
  idNumber: string
  email?: string | null
}

export default function OutstandingFeesPage() {
  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState<ClientResult[]>([])
  const [selectedClient, setSelectedClient] = useState<ClientResult | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)

  useEffect(() => {
    if (!clientSearch.trim() || selectedClient) {
      setClientResults([])
      return
    }
    const search = async () => {
      setSearchLoading(true)
      try {
        const res = await fetch(`/api/finance/clients/search?q=${encodeURIComponent(clientSearch)}`)
        if (res.ok) {
          const data = await res.json()
          setClientResults(Array.isArray(data) ? data : (data.clients ?? []))
        }
      } finally {
        setSearchLoading(false)
      }
    }
    const timer = setTimeout(search, 300)
    return () => clearTimeout(timer)
  }, [clientSearch, selectedClient])

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-6">
        <Link href="/invoices" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block">
          ← Back to Invoices
        </Link>
        <h1 className="text-3xl font-bold text-white">Outstanding Fees</h1>
        <p className="text-gray-400 text-sm mt-1">
          Invoice or quote the receiving debt counsellor for fees the consumer still owes Zenowethu.
        </p>
      </div>

      {/* Optional consumer link */}
      <div className="bg-[var(--color-bg-secondary)] rounded-xl p-5 border border-white/5 mb-5">
        <label className="block text-xs text-gray-400 mb-1">
          Link a consumer <span className="text-gray-600">(optional — pre-fills name &amp; ID)</span>
        </label>
        <div className="relative">
          <input
            type="text"
            placeholder="Search by name or ID number…"
            value={selectedClient ? `${selectedClient.firstName} ${selectedClient.lastName} (${selectedClient.idNumber})` : clientSearch}
            onChange={(e) => {
              setSelectedClient(null)
              setClientSearch(e.currentTarget.value)
            }}
            className="w-full bg-black/30 border border-white/15 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-400/60"
          />
          {searchLoading && <p className="text-[11px] text-gray-500 mt-1">Searching…</p>}
          {clientResults.length > 0 && !selectedClient && (
            <div className="absolute z-10 mt-1 w-full bg-[#0e1117] border border-white/15 rounded-lg max-h-56 overflow-y-auto shadow-xl">
              {clientResults.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedClient(c); setClientResults([]) }}
                  className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5"
                >
                  {c.firstName} {c.lastName} <span className="text-gray-500">({c.idNumber})</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {selectedClient && (
          <button onClick={() => { setSelectedClient(null); setClientSearch('') }} className="text-[11px] text-cyan-400 hover:text-cyan-300 mt-1.5">
            Clear linked consumer
          </button>
        )}
      </div>

      {/* Shared generator — key forces re-init of prefill when the consumer changes */}
      <div className="bg-[var(--color-bg-secondary)] rounded-xl p-6 border border-white/5">
        <DcFeeInvoiceForm
          key={selectedClient?.id ?? 'manual'}
          clientId={selectedClient?.id}
          clientFirstName={selectedClient?.firstName}
          clientLastName={selectedClient?.lastName}
          clientIdNumber={selectedClient?.idNumber}
        />
      </div>
    </div>
  )
}
