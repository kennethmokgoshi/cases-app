'use client'

import { useState, useEffect } from 'react'

interface SystemStats {
  totalUsers: number
  activeUsers: number
  totalHours: string
  totalVerified: string
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<SystemStats>({
    totalUsers: 0,
    activeUsers: 0,
    totalHours: '0h',
    totalVerified: '0h',
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    setIsLoading(true)
    try {
      // Placeholder for system stats
      setStats({
        totalUsers: 24,
        activeUsers: 12,
        totalHours: '487h',
        totalVerified: '442h',
      })
    } catch (error) {
      console.error('Stats load error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900">Admin Dashboard</h1>
          <p className="text-slate-600 mt-2">System oversight and configuration</p>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-slate-600">Loading system data...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {/* System Stats */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="text-slate-600 text-sm font-medium">Total Users</div>
              <div className="text-4xl font-bold text-slate-900 mt-2">{stats.totalUsers}</div>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="text-slate-600 text-sm font-medium">Active Users</div>
              <div className="text-4xl font-bold text-green-600 mt-2">{stats.activeUsers}</div>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="text-slate-600 text-sm font-medium">Total Hours Logged</div>
              <div className="text-4xl font-bold text-slate-900 mt-2">{stats.totalHours}</div>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="text-slate-600 text-sm font-medium">Verified Hours</div>
              <div className="text-4xl font-bold text-blue-600 mt-2">{stats.totalVerified}</div>
            </div>
          </div>
        )}

        {/* Admin Options */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Admin Controls</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border-l-4 border-blue-500 pl-4 py-4">
              <h3 className="font-semibold text-slate-900">User Management</h3>
              <p className="text-slate-600 text-sm mt-2">Add users, manage roles, reset passwords</p>
            </div>

            <div className="border-l-4 border-purple-500 pl-4 py-4">
              <h3 className="font-semibold text-slate-900">System Settings</h3>
              <p className="text-slate-600 text-sm mt-2">Configure reporting preferences</p>
            </div>

            <div className="border-l-4 border-green-500 pl-4 py-4">
              <h3 className="font-semibold text-slate-900">Reports & Exports</h3>
              <p className="text-slate-600 text-sm mt-2">Generate system-wide reports</p>
            </div>

            <div className="border-l-4 border-amber-500 pl-4 py-4">
              <h3 className="font-semibold text-slate-900">Audit Logs</h3>
              <p className="text-slate-600 text-sm mt-2">View system activity and changes</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
