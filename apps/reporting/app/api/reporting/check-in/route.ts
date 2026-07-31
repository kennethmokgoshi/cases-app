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
        status: 'ONLINE',
        lastActivityAt: now,
        checkedInAt: now,
      },
      create: {
        userId: session!.user.id,
        status: 'ONLINE',
        lastActivityAt: now,
        checkedInAt: now,
      },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    })

    // Create session record
    const sessionId = 'sess_' + Math.random().toString(36).substring(2, 11)
    await prisma.$executeRawUnsafe(`
      INSERT INTO "EmployeeSession" (id, "userId", "loginAt", "createdAt", "updatedAt")
      VALUES ('${sessionId}', '${session!.user.id}', NOW(), NOW(), NOW())
    `)

    return NextResponse.json({ success: true, presence })
  } catch (error) {
    console.error('Check-in error:', error)
    return NextResponse.json({ error: 'Failed to check in' }, { status: 500 })
  }
}