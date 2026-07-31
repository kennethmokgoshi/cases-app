import { auth } from '@/lib/auth'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { verifyStaffApiAccess } from '@/lib/api-guard'
import { formatPerformerName } from '@/lib/role-check'
import { UserRole } from '@/lib/roles'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const authError = verifyStaffApiAccess(session)
  if (authError) return authError

  try {
    const { id: projectId } = await params
    const viewerRole = ((session!.user as any)?.reportingRole || 'staff') as UserRole

    // Fetch project to confirm existence
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Get file numbers associated with cases in this project
    const caseProjects = await prisma.caseProject.findMany({
      where: { projectId },
      select: { case: { select: { fileNumber: true } } },
    })
    const fileNumbers = caseProjects.map((cp) => cp.case?.fileNumber).filter(Boolean) as string[]

    // Get work logs for these cases, or project member logs
    const projectMembers = await prisma.projectMember.findMany({
      where: { projectId },
      select: { userId: true },
    })
    const memberUserIds = projectMembers.map((pm) => pm.userId)

    const logs = await prisma.workLog.findMany({
      where: {
        OR: [
          { fileNumber: { in: fileNumbers.length > 0 ? fileNumbers : ['__NONE__'] } },
          { userId: { in: memberUserIds.length > 0 ? memberUserIds : ['__NONE__'] } },
        ],
      },
      orderBy: { date: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            isAdmin: true,
            avatarUrl: true,
          },
        },
      },
      take: 50,
    })

    // Process each activity log with Senior Member anonymization
    const activity = logs.map((log) => {
      const performer = log.user

      let performerRole: UserRole = 'staff'
      if (performer.isAdmin) {
        performerRole = 'admin'
      } else {
        const rUpper = performer.role?.toUpperCase() || ''
        if (rUpper.includes('EXECUTIVE') || rUpper.includes('EXEC')) {
          performerRole = 'executive'
        } else if (
          rUpper.includes('SENIOR_MANAGER') ||
          rUpper.includes('SENIOR MANAGER') ||
          (rUpper.includes('SENIOR') && rUpper.includes('MANAGER'))
        ) {
          performerRole = 'senior_manager'
        } else if (rUpper.includes('MANAGER')) {
          performerRole = 'manager'
        } else if (rUpper.includes('FINANCE')) {
          performerRole = 'finance'
        }
      }

      const performerFullName = `${performer.firstName} ${performer.lastName}`.trim()
      const formatted = formatPerformerName(viewerRole, performerRole, performerFullName)

      return {
        id: log.id,
        date: log.date,
        category: log.category,
        description: log.description,
        durationMinutes: log.durationMinutes,
        fileNumber: log.fileNumber,
        isVerified: log.isVerified,
        performer: {
          id: formatted.isAnonymized ? 'anonymized' : performer.id,
          name: formatted.displayName,
          role: formatted.displayRole, // null if anonymized
          isAnonymized: formatted.isAnonymized,
          email: formatted.isAnonymized ? null : performer.email,
          avatarUrl: formatted.isAnonymized ? null : performer.avatarUrl,
        },
      }
    })

    return NextResponse.json({
      project,
      activity,
      totalCount: activity.length,
    })
  } catch (error) {
    console.error('Project activity fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch project activity' }, { status: 500 })
  }
}
