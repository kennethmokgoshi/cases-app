import { auth } from '@/lib/auth'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { verifyStaffApiAccess } from '@/lib/api-guard'

export async function POST(request: Request) {
  const session = await auth()
  const authError = verifyStaffApiAccess(session)
  if (authError) return authError

  try {
    const now = new Date()

    // Upsert employee presence
    const presence = await prisma.employeePresence.upsert({
      where: { userId: session!.user.id },
      update: {
        status: 'OFFLINE',
        checkedOutAt: now,
      },
      create: {
        userId: session!.user.id,
        status: 'OFFLINE',
        checkedOutAt: now,
      },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    })

    // Close only the single most recently opened session. A user should never have more than
    // one open session, but this guards against historical drift — closing every open row at
    // once previously stamped multi-day-old stale sessions with today's logout time, inflating
    // session-duration analytics. Any older dangling rows are cleaned up on the next check-in.
    await prisma.$executeRawUnsafe(`
      UPDATE "EmployeeSession"
      SET "logoutAt" = NOW(), "updatedAt" = NOW()
      WHERE id = (
        SELECT id FROM "EmployeeSession"
        WHERE "userId" = '${session!.user.id}' AND "logoutAt" IS NULL
        ORDER BY "loginAt" DESC
        LIMIT 1
      )
    `)

    return NextResponse.json({ success: true, presence })
  } catch (error) {
    console.error('Check-out error:', error)
    return NextResponse.json({ error: 'Failed to check out' }, { status: 500 })
  }
}