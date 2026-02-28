'use client'

import { useState, useCallback } from 'react'

type Payment = {
  id: string
  amount: number
  reference: string | null
  paymentDate: string
}

type ClientResult = {
  id: string
  firstName: string
  lastName: string
  idNumber: string
  cases: Array<{ id: string; fileNumber: string }>
}

interface AllocatePaymentModalProps {
  payment: Payment
  onClose: () => void
  onAllocated: () => void
}

function formatZAR(amount: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount)
}

export function AllocatePaymentModal({ payment, onClose, onAllocated }: AllocatePaymentModalProps) {
  const [query, setQuery]               = useState('')
  const [results, setResults]           = useState<ClientResult[]>([])
  const [searching, setSearching]       = useState(false)
  const [selectedClient, setSelectedClient] = useState<ClientResult | null>(null)
  const [selectedCaseId, setSelectedCaseId] = useState('')
  const [allocating, setAllocating]     = useState(false)
  const [error, setError]               = useState('')

  const searchClients = useCallback(async () => {
    if (!query.trim()) return
    setSearching(true)
    setResults([])
    setSelectedClient(null)
    setSelectedCaseId('')
    try {
      const params = new URLSearchParams({ search: query, limit: '10' })
      const res = await fetch(`/api/finance/clients?${params}`)
      if (res.ok) {
        const data = await res.json()
        setResults(data.clients ?? data)
      }
    } catch {
      setError('Failed to search clients')
    } finally {
      setSearching(false)
    }
  }, [query])

  async function handleAllocate() {
    if (!selectedClient) return
    setAllocating(true)
    setError('')
    try {
      const body: Record<string, string> = { clientId: selectedClient.id }
      if (selectedCaseId) body.caseId = selectedCaseId

      const res = await fetch(`/api/finance/payments/${payment.id}/allocate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body) })
      if (res.ok) {
        onAllocated()
        onClose()
      } else {
        const err = await res.json()
        setError(err.error ?? 'Allocation failed')
      }
    } catch {
      setError('Network error')
    } finally {
      setAllocating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--color-bg-secondary)] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-white font-semibold text-lg">Allocate Payment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-xl leading-none">×</button>
        </div>

        {/* Payment Summary */}
        <div className="px-6 py-4 bg-white/5 border-b border-white/10">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Amount</span>
            <span className="text-white font-semibold">{formatZAR(Number(payment.amount))}</span>
          </div>
          {payment.reference && (
            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-400">Reference</span>
              <span className="text-gray-300 font-mono">{payment.reference}</span>
            </div>
          )}
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-400">Date</span>
            <span className="text-gray-300">{new Date(payment.paymentDate).toLocaleDateString('en-ZA')}</span>
          </div>
        </div>

        {/* Search */}
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Search Client by Name or ID Number</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchClients()}
                placeholder="Type name or ID number..."
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:border-cyan-500 focus:outline-none"
              />
              <button
                onClick={searchClients}
                disabled={searching || !query.trim()}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                {searching ? '…' : 'Search'}
              </button>
            </div>
          </div>

          {/* Search Results */}
          {results.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {results.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedClient(c); setSelectedCaseId('') }}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                    selectedClient?.id === c.id
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-white'
                      : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                  }`}>
                  <p className="font-medium text-sm">{c.firstName} {c.lastName}</p>
                  <p className="text-xs text-gray-400">{c.idNumber}</p>
                </button>
              ))}
            </div>
          )}

          {/* Case Selection */}
          {selectedClient && selectedClient.cases.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Link to Case (optional)</label>
              <select
                value={selectedCaseId}
                onChange={(e) => setSelectedCaseId(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none">
                <option value="">No specific case</option>
                {selectedClient.cases.map((c) => (
                  <option key={c.id} value={c.id}>{c.fileNumber}</option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/10">
          <button onClick={onClose}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg text-sm transition-colors">
            Cancel
          </button>
          <button
            onClick={handleAllocate}
            disabled={!selectedClient || allocating}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {allocating ? 'Allocating…' : 'Confirm Allocation'}
          </button>
        </div>
      </div>
    </div>
  )
}
