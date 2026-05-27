'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type DCCPStats = {
  totalPolicies: number
  draftPolicies: number
  submittedPolicies: number
  activePolicies: number
  cliPolicies: number
  aipPolicies: number
  funeralPolicies: number
  currentMonthFee: number
  totalFeePaid: number
  totalFeePending: number
}

type DCCPPolicy = {
  id: string
  policyType: 'CLI' | 'AIP' | 'FUNERAL'
  status: 'DRAFT' | 'SUBMITTED' | 'ACTIVE' | 'LAPSED' | 'CANCELLED'
  clientFirstName: string
  clientLastName: string
  clientIdNumber: string
  retailPremium: number
  referralFee: number
  policyNumber: string | null
  inceptionDate: string | null
  createdAt: string
}

const STATUS_COLOUR: Record<string, string> = {
  DRAFT:      'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  SUBMITTED:  'text-blue-400 bg-blue-500/10 border-blue-500/20',
  ACTIVE:     'text-green-400 bg-green-500/10 border-green-500/20',
  LAPSED:     'text-red-400 bg-red-500/10 border-red-500/20',
  CANCELLED:  'text-gray-400 bg-gray-500/10 border-gray-500/20',
}

const TYPE_COLOUR: Record<string, string> = {
  CLI:    'text-cyan-400 bg-cyan-500/10',
  AIP:    'text-purple-400 bg-purple-500/10',
  FUNERAL:'text-orange-400 bg-orange-500/10',
}

const TYPE_LABEL: Record<string, string> = {
  CLI:    'Credit Life',
  AIP:    'Income Protector',
  FUNERAL:'Funeral Cover',
}

export default function DCCPDashboard() {
  const [stats, setStats] = useState<DCCPStats>({
    totalPolicies: 0, draftPolicies: 0, submittedPolicies: 0, activePolicies: 0,
    cliPolicies: 0, aipPolicies: 0, funeralPolicies: 0,
    currentMonthFee: 0, totalFeePaid: 0, totalFeePending: 0,
  })
  const [policies, setPolicies] = useState<DCCPPolicy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      const [policiesRes, commissionRes] = await Promise.all([
        fetch('/api/dccp/policies?take=10'),
        fetch('/api/dccp/commission?month=current'),
      ])
      if (!policiesRes.ok) throw new Error('Failed to load policies')
      const { policies: policyList, stats: policyStats } = await policiesRes.json()
      setPolicies(policyList ?? [])
      if (commissionRes.ok) {
        const commissionData = await commissionRes.json()
        setStats({ ...policyStats, ...commissionData })
      } else {
        setStats(policyStats)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load DCCP data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">DC Credit Protect</h1>
          <p className="text-gray-400 mt-1">Credit life insurance replacement pipeline</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/dccp/eligibility"
            className="px-4 py-2 bg-zeno-blue border border-white/10 text-white rounded-lg hover:bg-white/10 transition-all text-sm font-medium"
          >
            Check Eligibility
          </Link>
          <Link
            href="/dccp/new"
            className="px-4 py-2 bg-zeno-cyan hover:bg-cyan-400 text-zeno-navy rounded-lg transition-all text-sm font-bold shadow-lg shadow-zeno-cyan/20"
          >
            + New Policy
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-zeno-blue/30 p-5 rounded-xl border border-zeno-cyan/30">
          <p className="text-gray-400 text-xs mb-1">Total Policies</p>
          <p className="text-3xl font-bold text-white">{stats.totalPolicies}</p>
          <div className="flex gap-2 mt-2 text-xs">
            <span className="text-yellow-400">{stats.draftPolicies} draft</span>
            <span className="text-green-400">{stats.activePolicies} active</span>
          </div>
        </div>

        <div className="bg-zeno-blue/30 p-5 rounded-xl border border-cyan-500/30">
          <p className="text-gray-400 text-xs mb-1">By Product</p>
          <div className="space-y-1 mt-2">
            <div className="flex justify-between text-xs"><span className="text-cyan-400">CLI</span><span className="text-white font-bold">{stats.cliPolicies}</span></div>
            <div className="flex justify-between text-xs"><span className="text-purple-400">AIP</span><span className="text-white font-bold">{stats.aipPolicies}</span></div>
            <div className="flex justify-between text-xs"><span className="text-orange-400">Funeral</span><span className="text-white font-bold">{stats.funeralPolicies}</span></div>
          </div>
        </div>

        <div className="bg-zeno-blue/30 p-5 rounded-xl border border-green-500/30">
          <p className="text-gray-400 text-xs mb-1">This Month (Fee)</p>
          <p className="text-3xl font-bold text-green-400">R {stats.currentMonthFee.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-gray-400 mt-1">Commission earned</p>
        </div>

        <div className="bg-zeno-blue/30 p-5 rounded-xl border border-purple-500/30">
          <p className="text-gray-400 text-xs mb-1">Pending Payment</p>
          <p className="text-3xl font-bold text-purple-400">R {stats.totalFeePending.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-gray-400 mt-1">Paid before the 15th</p>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Link href="/dccp/commission" className="bg-zeno-blue/20 p-4 rounded-xl border border-white/5 hover:border-green-500/30 transition-all group flex items-center gap-4">
          <span className="text-2xl">💰</span>
          <div>
            <p className="font-medium text-white group-hover:text-green-400 transition-colors">Commission Dashboard</p>
            <p className="text-xs text-gray-400">Monthly breakdown by product</p>
          </div>
        </Link>
        <Link href="/dccp/eligibility" className="bg-zeno-blue/20 p-4 rounded-xl border border-white/5 hover:border-cyan-500/30 transition-all group flex items-center gap-4">
          <span className="text-2xl">✅</span>
          <div>
            <p className="font-medium text-white group-hover:text-cyan-400 transition-colors">Eligibility Checker</p>
            <p className="text-xs text-gray-400">Check client before capturing</p>
          </div>
        </Link>
        <Link href="/dccp/new" className="bg-zeno-blue/20 p-4 rounded-xl border border-white/5 hover:border-purple-500/30 transition-all group flex items-center gap-4">
          <span className="text-2xl">📋</span>
          <div>
            <p className="font-medium text-white group-hover:text-purple-400 transition-colors">Capture New Policy</p>
            <p className="text-xs text-gray-400">CLI, AIP or Funeral Cover</p>
          </div>
        </Link>
      </div>

      {/* Policy pipeline table */}
      <div className="bg-zeno-blue/20 rounded-2xl border border-white/5 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-zeno-cyan"></span>
            Recent Policies
          </h3>
          <Link href="/dccp/policies" className="text-xs text-zeno-cyan hover:text-cyan-300 transition-colors">
            View all →
          </Link>
        </div>

        {error && (
          <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={fetchData} className="text-xs text-red-300 underline mt-2">Retry</button>
          </div>
        )}

        {loading && !error && (
          <p className="text-gray-500 text-sm">Loading policies...</p>
        )}

        {!loading && !error && policies.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-gray-400 mb-4">No DCCP policies captured yet.</p>
            <Link href="/dccp/new" className="px-6 py-2 bg-zeno-cyan text-zeno-navy font-bold rounded-lg text-sm">
              Capture First Policy
            </Link>
          </div>
        )}

        {!loading && !error && policies.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-xs border-b border-white/5">
                  <th className="text-left pb-3 pr-4">Client</th>
                  <th className="text-left pb-3 pr-4">Product</th>
                  <th className="text-left pb-3 pr-4">Status</th>
                  <th className="text-right pb-3 pr-4">Premium</th>
                  <th className="text-right pb-3 pr-4">Our Fee</th>
                  <th className="text-left pb-3">Policy #</th>
                  <th className="text-right pb-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {policies.map(policy => (
                  <tr key={policy.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-white">{policy.clientFirstName} {policy.clientLastName}</p>
                      <p className="text-xs text-gray-400">{policy.clientIdNumber}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${TYPE_COLOUR[policy.policyType]}`}>
                        {TYPE_LABEL[policy.policyType]}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-1 rounded border text-xs font-medium ${STATUS_COLOUR[policy.status]}`}>
                        {policy.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right text-white font-medium">
                      R {Number(policy.retailPremium).toFixed(2)}
                    </td>
                    <td className="py-3 pr-4 text-right text-green-400 font-medium">
                      R {Number(policy.referralFee).toFixed(2)}
                    </td>
                    <td className="py-3 text-gray-400 text-xs">
                      {policy.policyNumber ?? <span className="text-yellow-400/60">Pending</span>}
                    </td>
                    <td className="py-3 text-right">
                      {policy.status === 'DRAFT' && (
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/dccp/policies/${policy.id}/submit`, { method: 'POST' });
                              if (res.ok) fetchData();
                              else alert('Submission failed. Please verify your credentials.');
                            } catch (e) {
                              alert('Error submitting policy.');
                            }
                          }}
                          className="px-3 py-1 bg-zeno-cyan text-zeno-navy text-xs font-bold rounded hover:bg-cyan-400 transition-colors"
                        >
                          Submit
                        </button>
                      )}
                      {policy.status !== 'DRAFT' && policy.policyNumber && (
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/dccp/policies/${policy.id}/status`);
                              if (res.ok) fetchData();
                            } catch (e) {
                              // Ignore errors
                            }
                          }}
                          className="px-3 py-1 bg-white/10 text-white text-xs font-medium rounded hover:bg-white/20 transition-colors"
                        >
                          Sync
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
