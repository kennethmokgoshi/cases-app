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

    // Update active session record
    await prisma.$executeRawUnsafe(`
      UPDATE "EmployeeSession"
      SET "logoutAt" = NOW(), "updatedAt" = NOW()
      WHERE "userId" = '${session!.user.id}' AND "logoutAt" IS NULL
    `)

    return NextResponse.json({ success: true, presence })
  } catch (error) {
    console.error('Check-out error:', error)
    return NextResponse.json({ error: 'Failed to check out' }, { status: 500 })
  }
}