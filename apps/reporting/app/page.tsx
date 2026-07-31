'use client'

import { signIn, useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { roleDashboardMap, type UserRole } from '@/lib/roles'

export default function RootPage() {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()
  const { data: session, status } = useSession()

  useEffect(() => {
    if (status === 'authenticated' && session) {
      const role = ((session.user as any)?.reportingRole || 'staff') as UserRole
      router.push(roleDashboardMap[role] || '/staff')
    }
  }, [session, status, router])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        // Parse error message for more specific feedback
        if (result.error.includes('NotAuthorized') || result.error.includes('@zenowethu')) {
          setError('Not Authorized: Access to reporting is restricted to internal @zenowethu staff members only.')
        } else if (result.error.includes('CredentialsSignin')) {
          setError('Email or password is incorrect. Please try again.')
        } else if (result.error.includes('AccessDenied')) {
          setError('Access denied. Your account may be inactive.')
        } else {
          setError(result.error || 'Invalid email or password')
        }
      } else if (result?.ok) {
        // After successful login, redirect to root which will trigger role-based redirect
        router.push('/')
        router.refresh()
      }
    } catch (err) {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-cyan-500 rounded-lg mx-auto mb-4 flex items-center justify-center shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Staff Reporting</h1>
          <p className="text-slate-300">Track your activities and time</p>
        </div>

        {/* Feature List */}
        <div className="bg-slate-800/50 rounded-lg shadow-lg p-6 mb-8 border border-slate-700 backdrop-blur">
          <p className="text-sm text-slate-300 mb-4 font-medium">This system allows you to:</p>
          <ul className="space-y-3 text-sm text-slate-300">
            <li className="flex items-center gap-3">
              <span className="text-cyan-400 font-bold">✓</span> Manual activity logging
            </li>
            <li className="flex items-center gap-3">
              <span className="text-cyan-400 font-bold">✓</span> Auto-detect work from database
            </li>
            <li className="flex items-center gap-3">
              <span className="text-cyan-400 font-bold">✓</span> Check in/out status tracking
            </li>
            <li className="flex items-center gap-3">
              <span className="text-cyan-400 font-bold">✓</span> Manager team visibility
            </li>
            <li className="flex items-center gap-3">
              <span className="text-cyan-400 font-bold">✓</span> Daily/weekly/monthly summaries
            </li>
          </ul>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="bg-slate-800 rounded-lg shadow-2xl p-6 border border-slate-700">
          {error && (
            <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm space-y-2">
              <div className="flex gap-2">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
              {error.includes('incorrect') && (
                <p className="text-red-400 text-xs pl-7">Tip: Check your email and password are correct. Passwords are case-sensitive.</p>
              )}
              {error.includes('inactive') && (
                <p className="text-red-400 text-xs pl-7">Contact your administrator to reactivate your account.</p>
              )}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-white mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition"
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-white mb-2">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-400 transition"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-4.803m5.596-3.856a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-cyan-500 text-slate-900 font-medium rounded-lg hover:bg-cyan-400 disabled:opacity-50 transition"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Test Credentials */}
        <div className="mt-8 p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-sm text-slate-300">
          <p className="font-medium text-cyan-400 mb-1">Test Credentials</p>
          <p>Use any valid Zenowethu staff email from the system</p>
        </div>
      </div>
    </div>
  )
}