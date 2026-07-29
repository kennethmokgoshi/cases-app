'use client'

import { useState, useEffect } from 'react'

interface FinanceData {
  totalPayroll: string
  pendingApprovals: number
  verifiedHours: string
  costPerHour: string
}

export default function FinanceDashboard() {
  const [data, setData] = useState<FinanceData>({
    totalPayroll: '$0',
    pendingApprovals: 0,
    verifiedHours: '0h',
    costPerHour: '$0',
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setIsLoading(true)
    try {
      // Placeholder for finance data
      setData({
        totalPayroll: '$12,450',
        pendingApprovals: 8,
        verifiedHours: '442h',
        costPerHour: '$28.15',
      })
    } catch (error) {
      console.error('Data load error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900">Finance Dashboard</h1>
          <p className="text-slate-600 mt-2">Payroll and cost management</p>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-slate-600">Loading financial data...</div>
        ) : (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="text-slate-600 text-sm font-medium">Total Payroll (Week)</div>
                <div className="text-3xl font-bold text-green-600 mt-2">{data.totalPayroll}</div>
              </div>

              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="text-slate-600 text-sm font-medium">Pending Approvals</div>
                <div className="text-3xl font-bold text-amber-600 mt-2">{data.pendingApprovals}</div>
              </div>

              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="text-slate-600 text-sm font-medium">Verified Hours</div>
                <div className="text-3xl font-bold text-blue-600 mt-2">{data.verifiedHours}</div>
              </div>

              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="text-slate-600 text-sm font-medium">Cost Per Hour</div>
                <div className="text-3xl font-bold text-slate-900 mt-2">{data.costPerHour}</div>
              </div>
            </div>

            {/* Finance Options */}
            <div className="bg-white rounded-lg shadow-lg p-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Finance Operations</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border-l-4 border-green-500 pl-4 py-4">
                  <h3 className="font-semibold text-slate-900">Payroll Processing</h3>
                  <p className="text-slate-600 text-sm mt-2">Approve and process timesheets for payment</p>
                </div>

                <div className="border-l-4 border-blue-500 pl-4 py-4">
                  <h3 className="font-semibold text-slate-900">Cost Analysis</h3>
                  <p className="text-slate-600 text-sm mt-2">Analyze labor costs and budgeting</p>
                </div>

                <div className="border-l-4 border-purple-500 pl-4 py-4">
                  <h3 className="font-semibold text-slate-900">Reports</h3>
                  <p className="text-slate-600 text-sm mt-2">Generate payroll and cost reports</p>
                </div>

                <div className="border-l-4 border-amber-500 pl-4 py-4">
                  <h3 className="font-semibold text-slate-900">Compliance</h3>
                  <p className="text-slate-600 text-sm mt-2">Ensure payroll compliance and audit trail</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
