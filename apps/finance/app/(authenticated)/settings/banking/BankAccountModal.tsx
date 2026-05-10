'use client'

import { useState, useEffect } from 'react'

type BankAccount = {
  id?: string
  bankName: string
  accountName: string
  accountNumber: string
  branchCode?: string | null
  accountType: string
  isDefault: boolean
  reference?: string | null
}

interface BankAccountModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  initialData?: BankAccount | null
}

export default function BankAccountModal({
  isOpen,
  onClose,
  onSuccess,
  initialData,
}: BankAccountModalProps) {
  const [formData, setFormData] = useState<BankAccount>({
    bankName: '',
    accountName: '',
    accountNumber: '',
    branchCode: '',
    accountType: 'CHEQUE',
    isDefault: false,
    reference: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (initialData) {
      setFormData({
        bankName: initialData.bankName,
        accountName: initialData.accountName,
        accountNumber: initialData.accountNumber,
        branchCode: initialData.branchCode || '',
        accountType: initialData.accountType,
        isDefault: initialData.isDefault,
        reference: initialData.reference || '',
      })
    } else {
      setFormData({
        bankName: '',
        accountName: '',
        accountNumber: '',
        branchCode: '',
        accountType: 'CHEQUE',
        isDefault: false,
        reference: '',
      })
    }
  }, [initialData, isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)

    try {
      const url = initialData?.id 
        ? `/api/finance/bank-accounts/${initialData.id}` 
        : '/api/finance/bank-accounts'
      
      const method = initialData?.id ? 'PATCH' : 'POST'
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save account')
      }

      onSuccess()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#1a1d23] border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8 border-b border-white/5 flex justify-between items-center bg-gradient-to-br from-white/5 to-transparent">
          <div>
            <h2 className="text-xl font-bold text-white">{initialData ? 'Edit Bank Account' : 'Add Bank Account'}</h2>
            <p className="text-xs text-gray-500 mt-1">Provide the details for client payments.</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Bank Name</label>
              <input
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
                placeholder="e.g. First National Bank"
                value={formData.bankName}
                onChange={e => setFormData({ ...formData, bankName: e.target.value })}
              />
            </div>

            <div className="col-span-2">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Account Name</label>
              <input
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
                placeholder="e.g. Zenowethu Debt Management"
                value={formData.accountName}
                onChange={e => setFormData({ ...formData, accountName: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Account Number</label>
              <input
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
                placeholder="123456789"
                value={formData.accountNumber}
                onChange={e => setFormData({ ...formData, accountNumber: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Branch Code</label>
              <input
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
                placeholder="250655"
                value={formData.branchCode || ''}
                onChange={e => setFormData({ ...formData, branchCode: e.target.value })}
              />
            </div>

            <div className="col-span-2">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Account Type</label>
              <div className="grid grid-cols-3 gap-2">
                {['CHEQUE', 'SAVINGS', 'CURRENT'].map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFormData({ ...formData, accountType: type })}
                    className={`py-2 rounded-lg text-xs font-bold border transition-all ${
                      formData.accountType === type
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400 shadow-lg shadow-emerald-500/5'
                        : 'bg-white/5 border-white/10 text-gray-500 hover:border-white/20'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="col-span-2 py-2">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className={`w-10 h-6 rounded-full p-1 transition-colors ${formData.isDefault ? 'bg-emerald-500' : 'bg-white/10'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${formData.isDefault ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
                <input
                  type="checkbox"
                  className="hidden"
                  checked={formData.isDefault}
                  onChange={e => setFormData({ ...formData, isDefault: e.target.checked })}
                />
                <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">Set as Default Account</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl text-sm font-bold text-gray-500 hover:text-white hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
            <button
              disabled={saving}
              type="submit"
              className="flex-[2] bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white px-4 py-3 rounded-xl font-bold transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {initialData ? 'Update Account' : 'Save Bank Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
