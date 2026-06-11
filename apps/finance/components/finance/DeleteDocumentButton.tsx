'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { confirm, useSession } from '@zenowethu/ui'

export type DeletableDocType = 'QUOTE' | 'INVOICE'

/**
 * Delete control for a quote or invoice.
 *
 * Visibility / permissions mirror the API (`DELETE /api/finance/invoices/[id]`):
 *  - QUOTE   — shown to every authenticated staff member.
 *  - INVOICE — shown only to administrators and executives.
 *
 * Renders nothing when the current user is not allowed to delete the document,
 * so regular staff never see a delete affordance on invoices.
 */
export default function DeleteDocumentButton({
  documentId,
  documentNumber,
  type,
  onDeleted,
  redirectTo,
  className,
}: {
  documentId: string
  documentNumber: string
  type: DeletableDocType
  /** Called after a successful delete (e.g. refresh a list). */
  onDeleted?: () => void
  /** Navigate here after a successful delete (e.g. back to a list page). */
  redirectTo?: string
  className?: string
}) {
  const router = useRouter()
  const { data: session } = useSession()
  const [deleting, setDeleting] = useState(false)

  const isAdmin = session?.user?.isAdmin === true
  const isExecutive = session?.user?.isExecutive === true
  const label = type === 'QUOTE' ? 'quote' : 'invoice'

  // Invoices may only be deleted by admins/executives; quotes by anyone signed in.
  const canDelete = type === 'QUOTE' || isAdmin || isExecutive
  if (!canDelete) return null

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete ${label}?`,
      message: `Permanently delete ${label} ${documentNumber}? This cannot be undone.`,
      confirmText: `Delete ${label}`,
      variant: 'danger',
    })
    if (!ok) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/finance/invoices/${documentId}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => null)
        await confirm({
          title: `Could not delete ${label}`,
          message: body?.error || `Failed to delete ${label} (error ${res.status}).`,
          confirmText: 'OK',
          variant: 'default',
        })
        return
      }
      onDeleted?.()
      if (redirectTo) router.push(redirectTo)
    } catch {
      await confirm({
        title: `Could not delete ${label}`,
        message: 'Could not reach the server. Please check your connection and try again.',
        confirmText: 'OK',
        variant: 'default',
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      title={`Delete ${label} ${documentNumber}`}
      className={
        className ??
        'text-xs text-red-400 hover:text-red-300 border border-red-500/30 rounded px-2 py-0.5 disabled:opacity-50 transition-colors'
      }
    >
      {deleting ? 'Deleting…' : 'Delete'}
    </button>
  )
}
