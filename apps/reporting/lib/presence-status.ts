import { z } from 'zod'

export const PRESENCE_STATUSES = [
  'AVAILABLE',
  'COLLABORATING',
  'DEEP_FOCUS',
  'ON_BREAK',
  'IN_MEETING',
  'OFFLINE',
] as const

export type PresenceStatus = (typeof PRESENCE_STATUSES)[number]

export const presenceStatusSchema = z.enum(PRESENCE_STATUSES)

// Statuses a staff member can pick from the header selector. OFFLINE is system-driven
// (check-out / sign-out), never chosen directly by the user.
export const SELECTABLE_PRESENCE_STATUSES = PRESENCE_STATUSES.filter(
  (status): status is Exclude<PresenceStatus, 'OFFLINE'> => status !== 'OFFLINE'
)

export const selectablePresenceStatusSchema = z.enum(
  SELECTABLE_PRESENCE_STATUSES as unknown as [Exclude<PresenceStatus, 'OFFLINE'>, ...Exclude<PresenceStatus, 'OFFLINE'>[]]
)

// DND-style statuses the user chose deliberately. These are exempt from the short (1hr)
// inactivity decay used for AVAILABLE/COLLABORATING, but still decay after a longer ceiling
// so a forgotten "In Meeting" doesn't stick forever.
const DND_STATUSES: readonly PresenceStatus[] = ['DEEP_FOCUS', 'ON_BREAK', 'IN_MEETING']

// Legacy status values from before the 6-status model existed. Mapped forward so old
// EmployeePresence rows (and anything written before this migration lands) render correctly.
const LEGACY_STATUS_MAP: Record<string, PresenceStatus> = {
  ONLINE: 'AVAILABLE',
  IDLE: 'AVAILABLE',
}

export function decaysOnShortIdle(status: PresenceStatus): boolean {
  return status === 'AVAILABLE' || status === 'COLLABORATING'
}

export function isDndStatus(status: PresenceStatus): boolean {
  return DND_STATUSES.includes(status)
}

export interface PresenceMetadata {
  status: PresenceStatus
  label: string
  emoji: string
  description: string
  dotColorClass: string
  badgeColorClass: string
  /** Whether teammates should feel comfortable interrupting this person with a quick question. */
  helpAvailable: boolean
}

const PRESENCE_METADATA: Record<PresenceStatus, PresenceMetadata> = {
  AVAILABLE: {
    status: 'AVAILABLE',
    label: 'Available',
    emoji: '🟢',
    description: 'Online, light workload, open to assisting others.',
    dotColorClass: 'bg-emerald-500',
    badgeColorClass: 'bg-emerald-100 text-emerald-800',
    helpAvailable: true,
  },
  COLLABORATING: {
    status: 'COLLABORATING',
    label: 'Collaborating',
    emoji: '🟡',
    description: 'Working, but open to quick questions or helping teammates.',
    dotColorClass: 'bg-amber-400',
    badgeColorClass: 'bg-amber-100 text-amber-800',
    helpAvailable: true,
  },
  DEEP_FOCUS: {
    status: 'DEEP_FOCUS',
    label: 'Deep Focus',
    emoji: '🔴',
    description: 'Working on urgent/critical tasks — do not disturb.',
    dotColorClass: 'bg-rose-500',
    badgeColorClass: 'bg-rose-100 text-rose-800',
    helpAvailable: false,
  },
  ON_BREAK: {
    status: 'ON_BREAK',
    label: 'On Break',
    emoji: '☕',
    description: 'Checked in, but away for lunch, tea, or a short break.',
    dotColorClass: 'bg-orange-400',
    badgeColorClass: 'bg-orange-100 text-orange-800',
    helpAvailable: false,
  },
  IN_MEETING: {
    status: 'IN_MEETING',
    label: 'In Meeting',
    emoji: '🟣',
    description: 'On a call with a client, Debt Counsellor, or team meeting.',
    dotColorClass: 'bg-purple-500',
    badgeColorClass: 'bg-purple-100 text-purple-800',
    helpAvailable: false,
  },
  OFFLINE: {
    status: 'OFFLINE',
    label: 'Offline',
    emoji: '⚪',
    description: 'Signed out of the system.',
    dotColorClass: 'bg-slate-300',
    badgeColorClass: 'bg-slate-100 text-slate-600',
    helpAvailable: false,
  },
}

/** Maps any raw DB value (including legacy ONLINE/IDLE) to a valid PresenceStatus, defaulting unknowns to OFFLINE. */
export function normalizePresenceStatus(raw: string | null | undefined): PresenceStatus {
  if (!raw) return 'OFFLINE'
  if (raw in LEGACY_STATUS_MAP) return LEGACY_STATUS_MAP[raw]
  const parsed = presenceStatusSchema.safeParse(raw)
  return parsed.success ? parsed.data : 'OFFLINE'
}

export function getPresenceMetadata(raw: string | null | undefined): PresenceMetadata {
  return PRESENCE_METADATA[normalizePresenceStatus(raw)]
}
