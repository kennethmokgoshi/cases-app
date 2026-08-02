'use client'

import { useEffect, useState } from 'react'
import {
  SELECTABLE_PRESENCE_STATUSES,
  getPresenceMetadata,
  type PresenceStatus,
} from '@/lib/presence-status'

export default function PresenceStatusSelector() {
  const [status, setStatus] = useState<PresenceStatus | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadStatus()

    // Presence can also change via the Check In/Out widget on the Staff dashboard, which
    // doesn't share state with this component — resync whenever the tab regains focus.
    function handleFocus() {
      loadStatus()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  async function loadStatus() {
    try {
      const res = await fetch('/api/reporting/presence/status')
      if (res.ok) {
        const data = await res.json()
        setStatus(data.status)
      }
    } catch (err) {
      console.error('Failed to load presence status:', err)
    }
  }

  async function updateStatus(next: PresenceStatus) {
    const previous = status
    setStatus(next)
    setIsOpen(false)
    setIsSaving(true)
    setError('')
    try {
      const res = await fetch('/api/reporting/presence/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) {
        setStatus(previous)
        setError('Could not update status')
      }
    } catch (err) {
      console.error('Failed to update presence status:', err)
      setStatus(previous)
      setError('Network error')
    } finally {
      setIsSaving(false)
    }
  }

  // Nothing to show until the user's current status has loaded — avoids a flash of a
  // default status that may not match what's actually stored.
  if (!status) return null

  const meta = getPresenceMetadata(status)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        disabled={isSaving}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg border border-slate-700 transition-all duration-150 disabled:opacity-50"
      >
        <span aria-hidden="true">{meta.emoji}</span>
        <span className="hidden sm:inline">{meta.label}</span>
        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div
            role="listbox"
            className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden"
          >
            {SELECTABLE_PRESENCE_STATUSES.map((option) => {
              const optionMeta = getPresenceMetadata(option)
              const isSelected = option === status
              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => updateStatus(option)}
                  className={`w-full text-left px-4 py-2.5 flex items-start gap-3 hover:bg-slate-50 transition ${
                    isSelected ? 'bg-slate-50' : ''
                  }`}
                >
                  <span className="text-base leading-5" aria-hidden="true">
                    {optionMeta.emoji}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800">{optionMeta.label}</span>
                    <span className="block text-xs text-slate-500">{optionMeta.description}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {error && (
        <p className="absolute right-0 mt-1 text-[11px] text-rose-400 whitespace-nowrap">{error}</p>
      )}
    </div>
  )
}
