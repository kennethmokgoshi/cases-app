'use client'

import { useState, useEffect } from 'react'

interface SendMandateModalProps {
  isOpen:      boolean
  onClose:     () => void
  caseId:      string
  clientName:  string
  clientEmail: string | null | undefined
  initialData: {
    bankName?: string
    accountHolder?: string
    accountNumber?: string
    branchCode?: string
    accountType?: string
    contractAmount?: string
    instalmentAmount?: string
    instalments?: string
  }
}

export default function SendMandateModal({
  isOpen,
  onClose,
  caseId,
  clientName,
  clientEmail,
  initialData
}: SendMandateModalProps) {
  const [bankDetails, setBankDetails] = useState({
    bankName: initialData.bankName || '',
    accountHolder: initialData.accountHolder || '',
    accountNumber: initialData.accountNumber || '',
    branchCode: initialData.branchCode || '',
    accountType: initialData.accountType || 'Savings',
  })

  const [paymentDetails, setPaymentDetails] = useState({
    contractAmount: initialData.contractAmount || '',
    instalmentAmount: initialData.instalmentAmount || '',
    numInstalments: initialData.instalments || '',
    frequency: 'Monthly',
    firstDate: '',
    lastDate: '',
  })

  const [salesPerson, setSalesPerson] = useState('')
  const [sendTo, setSendTo] = useState(clientEmail || '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setSuccess(false)
      setError('')
      setSendTo(clientEmail || '')
    }
  }, [isOpen, clientEmail])

  const handleSend = async () => {
    if (!sendTo) {
      setError('Recipient email is required')
      return
    }

    setSending(true)
    setError('')
    try {
      const res = await fetch(`/api/cases/${caseId}/mandate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: sendTo,
          bankDetails,
          paymentDetails,
          salesPerson
        })
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Failed to send mandate')
      }

      setSuccess(true)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#1a1d23] rounded-2xl border border-white/10 shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Send Mandate</h2>
              <p className="text-xs text-gray-500">{clientName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {success ? (
            <div className="text-center py-8 space-y-3">
              <div className="w-14 h-14 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-white font-semibold">Mandate Sent!</p>
              <p className="text-gray-500 text-sm">Successfully sent to {sendTo}</p>
              <button onClick={onClose} className="mt-4 px-6 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors text-sm">Close</button>
            </div>
          ) : (
            <>
              {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-2 text-sm">{error}</div>}

              {/* Bank Details */}
              <div className="space-y-3">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Bank Account Details</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">Bank Name</label>
                    <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white" value={bankDetails.bankName} onChange={e => setBankDetails({...bankDetails, bankName: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">Account Holder</label>
                    <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white" value={bankDetails.accountHolder} onChange={e => setBankDetails({...bankDetails, accountHolder: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">Account Number</label>
                    <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white" value={bankDetails.accountNumber} onChange={e => setBankDetails({...bankDetails, accountNumber: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">Branch Code</label>
                    <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white" value={bankDetails.branchCode} onChange={e => setBankDetails({...bankDetails, branchCode: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">Account Type</label>
                    <select className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white" value={bankDetails.accountType} onChange={e => setBankDetails({...bankDetails, accountType: e.target.value})}>
                      <option value="Savings" className="bg-[#1a1d23]">Savings</option>
                      <option value="Cheque" className="bg-[#1a1d23]">Cheque</option>
                      <option value="Transmission" className="bg-[#1a1d23]">Transmission</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Payment Details */}
              <div className="space-y-3">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Payment Instructions</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">Contract Amount (R)</label>
                    <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white" value={paymentDetails.contractAmount} onChange={e => setPaymentDetails({...paymentDetails, contractAmount: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">Instalment Amount (R)</label>
                    <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white" value={paymentDetails.instalmentAmount} onChange={e => setPaymentDetails({...paymentDetails, instalmentAmount: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">Number of instalments</label>
                    <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white" value={paymentDetails.numInstalments} onChange={e => setPaymentDetails({...paymentDetails, numInstalments: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">Frequency</label>
                    <select className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white" value={paymentDetails.frequency} onChange={e => setPaymentDetails({...paymentDetails, frequency: e.target.value})}>
                      <option value="Monthly" className="bg-[#1a1d23]">Monthly</option>
                      <option value="Weekly" className="bg-[#1a1d23]">Weekly</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">Start Date</label>
                    <input type="date" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white" value={paymentDetails.firstDate} onChange={e => setPaymentDetails({...paymentDetails, firstDate: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">Last Date</label>
                    <input type="date" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white" value={paymentDetails.lastDate} onChange={e => setPaymentDetails({...paymentDetails, lastDate: e.target.value})} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-gray-500 mb-1 block">Sales Person</label>
                    <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white" placeholder="Name" value={salesPerson} onChange={e => setSalesPerson(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Send To */}
              <div className="pt-2">
                <label className="text-[10px] text-gray-500 mb-1 block">Send to Email</label>
                <input className="w-full bg-blue-500/5 border border-blue-500/20 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500/50 outline-none" value={sendTo} onChange={e => setSendTo(e.target.value)} placeholder="client@email.com" />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="px-6 py-4 border-t border-white/5 flex items-center justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
            >
              {sending && <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
              Send Mandate
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
