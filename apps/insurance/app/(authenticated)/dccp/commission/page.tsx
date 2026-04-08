'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type MonthlyRecord = {
  month: string         // "2026-04"
  totalPolicies: number
  cliPolicies: number
  aipPolicies: number
  funeralPolicies: number
  totalPremium: number
  totalFee: number
  isPaid: boolean
  paidAt: string | null
}

type CommissionRecord = {
  id: string
  month: string
  policyType: 'CLI' | 'AIP' | 'FUNERAL'
  clientName: string
  policyNumber: string | null
  retailPremium: number
  referralFee: number
  isPaid: boolean
  paidAt: string | null
}

const POLICY_TYPE_COLOUR: Record<string, string> = {
  CLI:    'text-cyan-400 bg-cyan-500/10',
  AIP:    'text-purple-400 bg-purple-500/10',
  FUNERAL:'text-orange-400 bg-orange-500/10',
}

function monthLabel(m: string) {
  const [year, month] = m.split('-')
  return new Date(parseInt(year), parseInt(month) - 1).toLocaleString('en-ZA', { month: 'long', year: 'numeric' })
}

function zar(n: number) {
  return `R ${Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`
}

export default function DCCPCommissionPage() {
  const [months, setMonths] = useState<MonthlyRecord[]>([])
  const [records, setRecords] = useState<CommissionRecord[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchData(month?: string) {
    setLoading(true)
    setError(null)
    try {
      const qs = month ? `?month=${month}` : ''
      const res = await fetch(`/api/dccp/commission${qs}`)
      if (!res.ok) throw new Error('Failed to load commission data')
      const data = await res.json()
      setMonths(data.months ?? [])
      setRecords(data.records ?? [])
      if (!selectedMonth && data.months?.length) {
        setSelectedMonth(data.months[0].month)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  function handleMonthSelect(m: string) {
    setSelectedMonth(m)
    fetchData(m)
  }

  const currentMonthData = months.find(m => m.month === selectedMonth)
  const filteredRecords = records.filter(r => !selectedMonth || r.month === selectedMonth)

  // Totals for all months (ytd)
  const ytd = months.reduce(
    (acc, m) => ({
      premium: acc.premium + Number(m.totalPremium),
      fee: acc.fee + Number(m.totalFee),
      paid: acc.paid + (m.isPaid ? Number(m.totalFee) : 0),
      pending: acc.pending + (!m.isPaid ? Number(m.totalFee) : 0),
    }),
    { premium: 0, fee: 0, paid: 0, pending: 0 },
  )

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link href="/dccp" className="text-gray-400 hover:text-white text-sm">← DC Credit Protect</Link>
        <span className="text-gray-600">/</span>
        <span className="text-white text-sm">Commission</span>
      </div>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Commission Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">Monthly referral fee breakdown — paid by the 15th of each month</p>
        </div>
      </div>

      {/* YTD stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-zeno-blue/30 p-5 rounded-xl border border-white/10">
          <p className="text-gray-400 text-xs mb-1">Total Premium (All Time)</p>
          <p className="text-2xl font-bold text-white">{zar(ytd.premium)}</p>
        </div>
        <div className="bg-zeno-blue/30 p-5 rounded-xl border border-green-500/20">
          <p className="text-gray-400 text-xs mb-1">Total Fees Earned</p>
          <p className="text-2xl font-bold text-green-400">{zar(ytd.fee)}</p>
        </div>
        <div className="bg-zeno-blue/30 p-5 rounded-xl border border-cyan-500/20">
          <p className="text-gray-400 text-xs mb-1">Paid Out</p>
          <p className="text-2xl font-bold text-cyan-400">{zar(ytd.paid)}</p>
        </div>
        <div className="bg-zeno-blue/30 p-5 rounded-xl border border-purple-500/20">
          <p className="text-gray-400 text-xs mb-1">Pending Payment</p>
          <p className="text-2xl font-bold text-purple-400">{zar(ytd.pending)}</p>
        </div>
      </div>

      {error && (
        <div className="p-5 mb-6 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={() => fetchData()} className="text-xs text-red-300 underline mt-2">Retry</button>
        </div>
      )}

      {loading && !error && (
        <p className="text-gray-500 text-sm">Loading commission data...</p>
      )}

      {!loading && !error && months.length === 0 && (
        <div className="py-16 text-center bg-zeno-blue/20 rounded-2xl border border-white/5">
          <p className="text-gray-400 mb-2">No commission records yet.</p>
          <p className="text-gray-500 text-sm">Commission records are generated when policies become active.</p>
        </div>
      )}

      {!loading && !error && months.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Month list */}
          <div className="bg-zeno-blue/20 rounded-2xl border border-white/5 p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3 px-2">Monthly Summaries</h3>
            <div className="space-y-1">
              {months.map(m => (
                <button
                  key={m.month}
                  onClick={() => handleMonthSelect(m.month)}
                  className={`w-full text-left px-3 py-3 rounded-xl transition-all ${selectedMonth === m.month ? 'bg-zeno-cyan/10 border border-zeno-cyan/30' : 'hover:bg-white/5 border border-transparent'}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{monthLabel(m.month)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{m.totalPolicies} policies</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-green-400">{zar(m.totalFee)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${m.isPaid ? 'text-green-400 bg-green-500/10' : 'text-yellow-400 bg-yellow-500/10'}`}>
                        {m.isPaid ? 'Paid' : 'Pending'}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Month detail */}
          <div className="lg:col-span-2 space-y-4">
            {currentMonthData && (
              <>
                {/* Month header */}
                <div className="bg-zeno-blue/30 rounded-2xl border border-zeno-cyan/20 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">{monthLabel(currentMonthData.month)}</h3>
                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${currentMonthData.isPaid ? 'text-green-400 bg-green-500/10 border border-green-500/20' : 'text-yellow-400 bg-yellow-500/10 border border-yellow-500/20'}`}>
                      {currentMonthData.isPaid ? `Paid ${currentMonthData.paidAt ? new Date(currentMonthData.paidAt).toLocaleDateString('en-ZA') : ''}` : 'Awaiting Payment'}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="bg-black/20 p-3 rounded-xl text-center">
                      <p className="text-xs text-gray-400">Policies</p>
                      <p className="text-xl font-bold text-white">{currentMonthData.totalPolicies}</p>
                    </div>
                    <div className="bg-black/20 p-3 rounded-xl text-center">
                      <p className="text-xs text-gray-400">Total Premium</p>
                      <p className="text-lg font-bold text-white">{zar(currentMonthData.totalPremium)}</p>
                    </div>
                    <div className="bg-black/20 p-3 rounded-xl text-center border border-green-500/20">
                      <p className="text-xs text-gray-400">Your Fee</p>
                      <p className="text-xl font-bold text-green-400">{zar(currentMonthData.totalFee)}</p>
                    </div>
                    <div className="bg-black/20 p-3 rounded-xl">
                      <p className="text-xs text-gray-400 mb-1">By Product</p>
                      <div className="space-y-0.5 text-xs">
                        <div className="flex justify-between"><span className="text-cyan-400">CLI</span><span className="text-white">{currentMonthData.cliPolicies}</span></div>
                        <div className="flex justify-between"><span className="text-purple-400">AIP</span><span className="text-white">{currentMonthData.aipPolicies}</span></div>
                        <div className="flex justify-between"><span className="text-orange-400">Funeral</span><span className="text-white">{currentMonthData.funeralPolicies}</span></div>
                      </div>
                    </div>
                  </div>

                  {!currentMonthData.isPaid && (
                    <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs text-yellow-300">
                      Payment expected before the 15th. Cut-off for this month was the 5th.
                      Contact <a href="mailto:finance@dccp.co.za" className="underline hover:text-yellow-200">finance@dccp.co.za</a> for queries.
                    </div>
                  )}
                </div>

                {/* Per-policy records */}
                {filteredRecords.length > 0 && (
                  <div className="bg-zeno-blue/20 rounded-2xl border border-white/5 p-5">
                    <h4 className="text-sm font-semibold text-gray-300 mb-4">Policy Breakdown</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-gray-400 text-xs border-b border-white/5">
                            <th className="text-left pb-3 pr-4">Client</th>
                            <th className="text-left pb-3 pr-4">Product</th>
                            <th className="text-left pb-3 pr-4">Policy #</th>
                            <th className="text-right pb-3 pr-4">Premium</th>
                            <th className="text-right pb-3 pr-4">Our Fee</th>
                            <th className="text-left pb-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {filteredRecords.map(rec => (
                            <tr key={rec.id} className="hover:bg-white/5 transition-colors">
                              <td className="py-2.5 pr-4 text-white">{rec.clientName}</td>
                              <td className="py-2.5 pr-4">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${POLICY_TYPE_COLOUR[rec.policyType]}`}>
                                  {rec.policyType}
                                </span>
                              </td>
                              <td className="py-2.5 pr-4 text-gray-400 text-xs">
                                {rec.policyNumber ?? <span className="text-yellow-400/60">Pending</span>}
                              </td>
                              <td className="py-2.5 pr-4 text-right text-white">{zar(rec.retailPremium)}</td>
                              <td className="py-2.5 pr-4 text-right text-green-400 font-medium">{zar(rec.referralFee)}</td>
                              <td className="py-2.5">
                                <span className={`px-2 py-0.5 rounded text-xs ${rec.isPaid ? 'text-green-400 bg-green-500/10' : 'text-yellow-400 bg-yellow-500/10'}`}>
                                  {rec.isPaid ? 'Paid' : 'Pending'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-white/10">
                            <td colSpan={3} className="pt-3 text-xs text-gray-400 font-medium">Total</td>
                            <td className="pt-3 text-right text-white font-bold">
                              {zar(filteredRecords.reduce((s, r) => s + Number(r.retailPremium), 0))}
                            </td>
                            <td className="pt-3 pr-4 text-right text-green-400 font-bold">
                              {zar(filteredRecords.reduce((s, r) => s + Number(r.referralFee), 0))}
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Payment terms info */}
      <div className="mt-8 bg-zeno-blue/20 border border-white/5 rounded-xl p-5">
        <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Commission Payment Terms</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-400">
          <div>
            <p className="text-white font-medium mb-1">First Commission</p>
            <p>Paid 45 days after policy inception date.</p>
          </div>
          <div>
            <p className="text-white font-medium mb-1">Monthly Cut-off</p>
            <p>5th of each month. Report covers 1st–31st of previous month.</p>
          </div>
          <div>
            <p className="text-white font-medium mb-1">Payment Date</p>
            <p>Paid before the 15th of each month. Contact: <a href="mailto:finance@dccp.co.za" className="text-zeno-cyan underline">finance@dccp.co.za</a></p>
          </div>
        </div>
      </div>
    </div>
  )
}
