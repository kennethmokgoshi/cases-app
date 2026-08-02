import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { verifyStaffApiAccess } from '@/lib/api-guard'
import { decaysOnShortIdle, normalizePresenceStatus, SELECTABLE_PRESENCE_STATUSES } from '@/lib/presence-status'

// AVAILABLE/COLLABORATING (and legacy ONLINE/IDLE) decay to OFFLINE after 1hr of inactivity —
// same threshold the presence system used before the 6-status model.
const SHORT_IDLE_MS = 60 * 60 * 1000
// DND-style statuses (DEEP_FOCUS/ON_BREAK/IN_MEETING) are exempt from the short timeout since
// they were chosen deliberately, but still decay after a longer ceiling so a forgotten
// "In Meeting" doesn't stick forever.
const LONG_IDLE_MS = 12 * 60 * 60 * 1000

export async function GET(request: Request) {
  const session = await auth()
  const authError = verifyStaffApiAccess(session)
  if (authError) return authError
  try {
    // Get all staff currently in any online status, including legacy values pending normalization.
    const onlineStaff = await prisma.employeePresence.findMany({
      where: {
        status: { in: ['ONLINE', 'IDLE', ...SELECTABLE_PRESENCE_STATUSES] },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { lastActivityAt: 'desc' },
    })

    const now = new Date()
    const shortIdleCutoff = new Date(now.getTime() - SHORT_IDLE_MS)
    const longIdleCutoff = new Date(now.getTime() - LONG_IDLE_MS)

    // Decay AVAILABLE/COLLABORATING (+ legacy ONLINE/IDLE) after the short timeout.
    await prisma.employeePresence.updateMany({
      where: {
        status: { in: ['ONLINE', 'IDLE', 'AVAILABLE', 'COLLABORATING'] },
        lastActivityAt: { lt: shortIdleCutoff },
      },
      data: { status: 'OFFLINE' },
    })

    // Decay DND statuses after the longer ceiling.
    await prisma.employeePresence.updateMany({
      where: {
        status: { in: ['DEEP_FOCUS', 'ON_BREAK', 'IN_MEETING'] },
        lastActivityAt: { lt: longIdleCutoff },
      },
      data: { status: 'OFFLINE' },
    })

    // Filter + normalize in memory against the same cutoffs (avoids a second DB round-trip).
    const activeStaff = onlineStaff
      .map((s) => ({ ...s, status: normalizePresenceStatus(s.status) }))
      .filter((s) => {
        if (!s.lastActivityAt) return true
        const cutoff = decaysOnShortIdle(s.status) ? shortIdleCutoff : longIdleCutoff
        return s.lastActivityAt >= cutoff
      })

    return NextResponse.json({ online: activeStaff, total: activeStaff.length })
  } catch (error) {
    console.error('Presence fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch presence' }, { status: 500 })
  }
}