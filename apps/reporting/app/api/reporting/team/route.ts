import { auth } from '../../../../lib/auth'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const url = new URL(request.url)
    const startDate = url.searchParams.get('startDate')
    const endDate = url.searchParams.get('endDate')

    // Get team members (simple: all staff for now, can be enhanced with team structure)
    const teamMembers = await prisma.user.findMany({
      where: {
        userType: 'STAFF',
        isLocked: false,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        avatarUrl: true,
      },
    })

    // Get activity for each team member
    const teamActivity = await Promise.all(
      teamMembers.map(async (member) => {
        const where: any = { userId: member.id }

        if (startDate || endDate) {
          where.date = {}
          if (startDate) where.date.gte = new Date(startDate)
          if (endDate) where.date.lte = new Date(endDate)
        }

        const logs = await prisma.workLog.findMany({
          where,
          select: { durationMinutes: true, isVerified: true },
        })

        const presence = await prisma.employeePresence.findUnique({
          where: { userId: member.id },
          select: { status: true, lastActivityAt: true },
        })

        const totalMinutes = logs.reduce((sum, log) => sum + log.durationMinutes, 0)
        const verifiedMinutes = logs
          .filter((log) => log.isVerified)
          .reduce((sum, log) => sum + log.durationMinutes, 0)

        return {
          ...member,
          status: presence?.status || 'OFFLINE',
          lastActivityAt: presence?.lastActivityAt,
          totalMinutes,
          totalHours: (totalMinutes / 60).toFixed(1),
          verifiedMinutes,
          verifiedHours: (verifiedMinutes / 60).toFixed(1),
          logCount: logs.length,
          verifiedCount: logs.filter((l) => l.isVerified).length,
        }
      })
    )

    return NextResponse.json({ team: teamActivity, total: teamActivity.length })
  } catch (error) {
    console.error('Team fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch team data' }, { status: 500 })
  }
}