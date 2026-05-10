'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import BankAccountModal from './BankAccountModal'

type BankAccount = {
  id: string
  bankName: string
  accountName: string
  accountNumber: string
  branchCode?: string | null
  accountType: string
  isDefault: boolean
  isActive: boolean
  reference?: string | null
}

export default function BankingSettingsPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null)
  const [error, setError] = useState('')

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/finance/bank-accounts')
      const data = await res.json()
      setAccounts(data.accounts || [])
    } catch (err) {
      setError('Failed to load bank accounts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAccounts()
  }, [])

  const handleSetDefault = async (id: string) => {
    try {
      await fetch(`/api/finance/bank-accounts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isDefault: true }),
      })
      fetchAccounts()
    } catch (err) {
      setError('Failed to update default account')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this bank account? It will no longer appear on new quotes.')) return
    try {
      await fetch(`/api/finance/bank-accounts/${id}`, { method: 'DELETE' })
      fetchAccounts()
    } catch (err) {
      setError('Failed to deactivate account')
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Banking Details</h1>
          <p className="text-gray-400 text-sm">Manage the bank accounts used for your quotations and invoices.</p>
        </div>
        <button
          onClick={() => { setEditingAccount(null); setModalOpen(true) }}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Add Bank Account
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          <p className="text-gray-500 text-sm animate-pulse">Loading banking data...</p>
        </div>
      ) : accounts.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-20 text-center flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-2">
            <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-white">No bank accounts yet</h3>
          <p className="text-gray-500 max-w-sm mx-auto">Add your first bank account to start including payment details on your quotes and invoices.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {accounts.map(account => (
            <div key={account.id} className={`group relative bg-[#1a1d23] border transition-all rounded-2xl p-6 hover:shadow-2xl hover:shadow-emerald-500/5 ${
              account.isDefault ? 'border-emerald-500/30 ring-1 ring-emerald-500/20' : 'border-white/10 hover:border-white/20'
            }`}>
              {account.isDefault && (
                <div className="absolute top-4 right-4 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded">
                  Default
                </div>
              )}
              
              <div className="flex items-start gap-4 mb-6">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  account.isDefault ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-gray-500'
                }`}>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white leading-tight">{account.bankName}</h3>
                  <p className="text-sm text-gray-500">{account.accountType} Account</p>
                </div>
              </div>

              <div className="space-y-3 mb-8">
                <div>
                  <p className="text-[10px] text-gray-600 uppercase font-bold tracking-wider mb-0.5">Account Name</p>
                  <p className="text-sm text-gray-300">{account.accountName}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-600 uppercase font-bold tracking-wider mb-0.5">Account Number</p>
                  <p className="text-sm text-gray-300 font-mono tracking-wider">{account.accountNumber}</p>
                </div>
                {account.branchCode && (
                  <div>
                    <p className="text-[10px] text-gray-600 uppercase font-bold tracking-wider mb-0.5">Branch Code</p>
                    <p className="text-sm text-gray-300">{account.branchCode}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                {!account.isDefault && (
                  <button
                    onClick={() => handleSetDefault(account.id)}
                    className="text-xs font-semibold text-emerald-500 hover:text-emerald-400 transition-colors py-1 px-2 rounded hover:bg-emerald-500/5"
                  >
                    Set as Default
                  </button>
                )}
                <button
                  onClick={() => { setEditingAccount(account); setModalOpen(true) }}
                  className="text-xs font-semibold text-gray-500 hover:text-white transition-colors py-1 px-2 rounded hover:bg-white/5"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(account.id)}
                  className="ml-auto text-xs font-semibold text-gray-700 hover:text-red-400 transition-colors py-1 px-2 rounded hover:bg-red-500/5 opacity-0 group-hover:opacity-100"
                >
                  Archive
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <BankAccountModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSuccess={() => { setModalOpen(false); fetchAccounts() }}
          initialData={editingAccount}
        />
      )}
    </div>
  )
}
