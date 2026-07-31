'use client'

import { signOut } from 'next-auth/react'

interface NotAuthorizedProps {
  userEmail?: string | null
}

export default function NotAuthorized({ userEmail }: NotAuthorizedProps) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-2xl p-8 text-center shadow-2xl shadow-red-950/20 backdrop-blur">
        {/* Lock / Shield Icon */}
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-full mx-auto mb-6 flex items-center justify-center">
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <span className="inline-block px-3 py-1 bg-red-500/20 border border-red-500/40 rounded-full text-xs font-semibold text-red-300 uppercase tracking-widest mb-3">
          403 — Forbidden
        </span>

        <h1 className="text-2xl font-bold text-white mb-2">Not Authorized</h1>

        <p className="text-slate-300 text-sm mb-6 leading-relaxed">
          Access to the <strong className="text-white">Reporting App</strong> is strictly restricted to internal <strong className="text-cyan-400">@zenowethu</strong> staff members only.
        </p>

        {userEmail && (
          <div className="bg-slate-800/80 border border-slate-700 rounded-lg p-3 mb-6 font-mono text-xs text-slate-400 truncate">
            Signed in as: <span className="text-slate-200">{userEmail}</span>
          </div>
        )}

        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="w-full py-3 px-4 bg-slate-800 hover:bg-red-950 text-white font-medium rounded-xl border border-slate-700 hover:border-red-900 transition duration-150 flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign Out & Try Another Account
        </button>
      </div>
    </div>
  )
}
