import { auth } from '@/lib/auth'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { verifyStaffApiAccess } from '@/lib/api-guard'
import { selectablePresenceStatusSchema, type PresenceStatus } from '@/lib/presence-status'

export async function POST(request: Request) {
  const session = await auth()
  const authError = verifyStaffApiAccess(session)
  if (authError) return authError

  try {
    const now = new Date()
    const userId = session!.user.id

    // Optional status override — falls back to AVAILABLE for a bare check-in or an invalid value.
    const body = await request.json().catch(() => null)
    const parsedStatus = selectablePresenceStatusSchema.safeParse(body?.status)
    const status: PresenceStatus = parsedStatus.success ? parsedStatus.data : 'AVAILABLE'

    const existingPresence = await prisma.employeePresence.findUnique({
      where: { userId },
      select: { lastActivityAt: true },
    })
    const lastKnownActivity = existingPresence?.lastActivityAt ?? now

    // Close any dangling open session before starting a new one. A prior check-in without a
    // matching check-out (crashed tab, forgotten sign-out) must never leave two concurrent
    // "open" sessions — that silently corrupts session-duration analytics. Back-date the
    // close to the last known activity rather than "now" so the stale gap isn't counted.
    await prisma.$executeRawUnsafe(`
      UPDATE "EmployeeSession"
      SET "logoutAt" = '${lastKnownActivity.toISOString()}', "updatedAt" = NOW()
      WHERE "userId" = '${userId}' AND "logoutAt" IS NULL
    `)

    // Upsert employee presence
    const presence = await prisma.employeePresence.upsert({
      where: { userId },
      update: {
        status,
        lastActivityAt: now,
        checkedInAt: now,
      },
      create: {
        userId,
        status,
        lastActivityAt: now,
        checkedInAt: now,
      },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    })

    // Create session record
    const sessionId = 'sess_' + Math.random().toString(36).substring(2, 11)
    await prisma.$executeRawUnsafe(`
      INSERT INTO "EmployeeSession" (id, "userId", "loginAt", "createdAt", "updatedAt")
      VALUES ('${sessionId}', '${userId}', NOW(), NOW(), NOW())
    `)

    return NextResponse.json({ success: true, presence })
  } catch (error) {
    console.error('Check-in error:', error)
    return NextResponse.json({ error: 'Failed to check in' }, { status: 500 })
  }
}