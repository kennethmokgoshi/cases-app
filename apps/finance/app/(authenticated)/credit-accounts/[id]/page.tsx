'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

type CreditAccountDetail = {
  id: string
  creditorName: string
  accountNumber: string | null
  accountType: string
  originalAmount: number | null
  outstandingBalance: number
  monthlyInstalment: number | null
  interestRate: number | null
  termMonths: number | null
  hasInsurance: boolean
  insurerName: string | null
  policyNumber: string | null
  premiumAmount: number | null
  premiumRate: number | null
  premiumSource: string
  premiumConfidence: string
  status: string
  isPrescribed: boolean
  prescriptionDate: string | null
  isIncluded: boolean
  case: { id: string; fileNumber: string } | null
  client: { firstName: string; lastName: string; idNumber: string; email: string | null } | null
  documents: Array<{
    id: string
    fileName: string
    documentType: string
    extractionStatus: string
    uploadedAt: string
  }>
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:   'bg-emerald-500/20 text-emerald-400',
  CLOSED:   'bg-gray-500/20 text-gray-400',
  DISPUTED: 'bg-red-500/20 text-red-400',
  SETTLED:  'bg-blue-500/20 text-blue-400' }

function formatZAR(amount: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount)
}

export default function CreditAccountDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [account, setAccount] = useState<CreditAccountDetail | null>(null)
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function fetchAccount() {
      try {
        const res = await fetch(`/api/finance/credit-accounts/${id}`)
        if (res.status === 404) { setNotFound(true); return }
        if (res.ok) setAccount(await res.json())
      } finally {
        setLoading(false)
      }
    }
    fetchAccount()
  }, [id])

  if (loading) {
    return <div className="p-6 flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" /></div>
  }

  if (notFound || !account) {
    return (
      <div className="p-6 text-center py-16">
        <p className="text-lg text-gray-400 mb-4">Credit account not found.</p>
        <Link href="/credit-accounts" className="text-cyan-400 hover:text-cyan-300 text-sm">← Back to Credit Accounts</Link>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link href="/credit-accounts" className="text-cyan-400 hover:text-cyan-300 text-sm mb-2 inline-block">
          ← Back to Credit Accounts
        </Link>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-3xl font-bold text-white">{account.creditorName}</h1>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[account.status] ?? 'bg-yellow-500/20 text-yellow-400'}`}>
            {account.status}
          </span>
          {account.isPrescribed && (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400">Prescribed</span>
          )}
        </div>
        <p className="text-gray-400 text-sm mt-1">{account.accountType}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Account Details */}
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h2 className="text-white font-semibold mb-4">Account Details</h2>
          <dl className="space-y-3 text-sm">
            {account.accountNumber && (
              <div className="flex justify-between">
                <dt className="text-gray-400">Account Number</dt>
                <dd className="text-white font-mono">{account.accountNumber}</dd>
              </div>
            )}
            {account.originalAmount != null && (
              <div className="flex justify-between">
                <dt className="text-gray-400">Original Amount</dt>
                <dd className="text-white">{formatZAR(Number(account.originalAmount))}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-400">Outstanding Balance</dt>
              <dd className="text-white font-semibold">{formatZAR(Number(account.outstandingBalance))}</dd>
            </div>
            {account.monthlyInstalment != null && (
              <div className="flex justify-between">
                <dt className="text-gray-400">Monthly Instalment</dt>
                <dd className="text-white">{formatZAR(Number(account.monthlyInstalment))}</dd>
              </div>
            )}
            {account.interestRate != null && (
              <div className="flex justify-between">
                <dt className="text-gray-400">Interest Rate</dt>
                <dd className="text-white">{Number(account.interestRate).toFixed(2)}%</dd>
              </div>
            )}
            {account.termMonths != null && (
              <div className="flex justify-between">
                <dt className="text-gray-400">Term</dt>
                <dd className="text-white">{account.termMonths} months</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-400">Included in Debt Review</dt>
              <dd className={account.isIncluded ? 'text-emerald-400' : 'text-gray-400'}>
                {account.isIncluded ? 'Yes' : 'No'}
              </dd>
            </div>
            {account.isPrescribed && account.prescriptionDate && (
              <div className="flex justify-between">
                <dt className="text-gray-400">Prescription Date</dt>
                <dd className="text-red-400">{new Date(account.prescriptionDate).toLocaleDateString('en-ZA')}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Insurance */}
        <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
          <h2 className="text-white font-semibold mb-4">Credit Life Insurance</h2>
          <div className="mb-4">
            {account.hasInsurance ? (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-400">Has Insurance</span>
            ) : (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-500/20 text-gray-400">No Insurance</span>
            )}
          </div>
          {account.hasInsurance && (
            <dl className="space-y-3 text-sm">
              {account.insurerName && (
                <div className="flex justify-between">
                  <dt className="text-gray-400">Insurer</dt>
                  <dd className="text-white">{account.insurerName}</dd>
                </div>
              )}
              {account.policyNumber && (
                <div className="flex justify-between">
                  <dt className="text-gray-400">Policy Number</dt>
                  <dd className="text-white font-mono">{account.policyNumber}</dd>
                </div>
              )}
              {account.premiumAmount != null && (
                <div className="flex justify-between">
                  <dt className="text-gray-400">Premium Amount</dt>
                  <dd className="text-white">{formatZAR(Number(account.premiumAmount))}</dd>
                </div>
              )}
              {account.premiumRate != null && (
                <div className="flex justify-between">
                  <dt className="text-gray-400">Premium Rate</dt>
                  <dd className="text-white">{Number(account.premiumRate).toFixed(4)}%</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-400">Premium Source</dt>
                <dd className="text-white">{account.premiumSource}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Confidence</dt>
                <dd className={account.premiumConfidence === 'HIGH' ? 'text-emerald-400' : account.premiumConfidence === 'MEDIUM' ? 'text-yellow-400' : 'text-gray-400'}>
                  {account.premiumConfidence}
                </dd>
              </div>
            </dl>
          )}
        </div>
      </div>

      {/* Client & Case */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {account.client && (
          <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
            <h2 className="text-white font-semibold mb-3">Client</h2>
            <p className="text-white font-medium">{account.client.firstName} {account.client.lastName}</p>
            <p className="text-gray-400 text-sm">{account.client.idNumber}</p>
            {account.client.email && <p className="text-gray-400 text-sm">{account.client.email}</p>}
          </div>
        )}
        {account.case && (
          <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl border border-white/5">
            <h2 className="text-white font-semibold mb-3">Linked Case</h2>
            <Link href={`/cases/${account.case.id}`} className="text-cyan-400 hover:text-cyan-300 font-mono text-lg">
              {account.case.fileNumber}
            </Link>
          </div>
        )}
      </div>

      {/* Documents */}
      {account.documents && account.documents.length > 0 && (
        <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5">
            <h2 className="text-white font-semibold">Documents ({account.documents.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">File Name</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Extraction</th>
                  <th className="px-5 py-3">Uploaded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {account.documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3 text-white">{doc.fileName}</td>
                    <td className="px-5 py-3 text-gray-400">{doc.documentType}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        doc.extractionStatus === 'SUCCESS'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : doc.extractionStatus === 'FAILED'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {doc.extractionStatus}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400">
                      {new Date(doc.uploadedAt).toLocaleDateString('en-ZA')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
