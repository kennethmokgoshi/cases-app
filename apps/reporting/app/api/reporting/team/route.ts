import { auth } from '@/lib/auth'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { verifyStaffApiAccess } from '@/lib/api-guard'
import { canViewUser } from '@/lib/role-check'
import { UserRole } from '@/lib/roles'

export async function GET(request: Request) {
  const session = await auth()
  const authError = verifyStaffApiAccess(session)
  if (authError) return authError

  try {
    const url = new URL(request.url)
    const startDate = url.searchParams.get('startDate')
    const endDate = url.searchParams.get('endDate')
    const viewerRole = ((session!.user as any)?.reportingRole || 'staff') as UserRole

    // Get team members with role & isAdmin to evaluate level hierarchy visibility
    const rawTeamMembers = await prisma.user.findMany({
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
        role: true,
        isAdmin: true,
      },
    })

    // Filter members based on 5-level hierarchy rules:
    // Admin (5) sees all.
    // Exec (4) sees <= 4 (not 5).
    // Sr Mgr (3) sees <= 3 (not 4 or 5).
    // Mgr (2) sees <= 2 (not 3, 4 or 5).
    const teamMembers = rawTeamMembers.filter((m) => {
      let memberRole: UserRole = 'staff'
      if (m.isAdmin) {
        memberRole = 'admin'
      } else {
        const rUpper = m.role?.toUpperCase() || ''
        if (rUpper.includes('EXECUTIVE') || rUpper.includes('EXEC')) {
          memberRole = 'executive'
        } else if (
          rUpper.includes('SENIOR_MANAGER') ||
          rUpper.includes('SENIOR MANAGER') ||
          (rUpper.includes('SENIOR') && rUpper.includes('MANAGER'))
        ) {
          memberRole = 'senior_manager'
        } else if (rUpper.includes('MANAGER')) {
          memberRole = 'manager'
        } else if (rUpper.includes('FINANCE')) {
          memberRole = 'finance'
        }
      }

      return canViewUser(viewerRole, memberRole)
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