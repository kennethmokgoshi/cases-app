import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { verifyStaffApiAccess } from '@/lib/api-guard'

export async function GET(request: Request) {
  const session = await auth()
  const authError = verifyStaffApiAccess(session)
  if (authError) return authError
  try {
    // Get all online and idle staff
    const onlineStaff = await prisma.employeePresence.findMany({
      where: {
        status: { in: ['ONLINE', 'IDLE'] },
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

    // Check for idle timeouts (30 min since last activity)
    const now = new Date()
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

    // Update idle staff to offline if last activity > 1 hour
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    await prisma.employeePresence.updateMany({
      where: {
        status: 'IDLE',
        lastActivityAt: { lt: oneHourAgo },
      },
      data: { status: 'OFFLINE' },
    })

    // Return online/idle staff
    const activeStaff = onlineStaff
      .filter((s) => s.lastActivityAt === null || s.lastActivityAt > thirtyMinutesAgo)
      .map((s) => ({
        ...s,
        status: s.lastActivityAt && s.lastActivityAt < thirtyMinutesAgo ? 'IDLE' : s.status,
      }))

    return NextResponse.json({ online: activeStaff, total: activeStaff.length })
  } catch (error) {
    console.error('Presence fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch presence' }, { status: 500 })
  }
}