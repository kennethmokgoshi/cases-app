import { auth } from '@/lib/auth'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { verifyStaffApiAccess } from '@/lib/api-guard'

export async function GET(request: Request) {
  const session = await auth()
  const authError = verifyStaffApiAccess(session)
  if (authError) return authError

  try {
    const currentUserId = session!.user.id

    // Fetch projects with members and case counts
    const projects = await prisma.project.findMany({
      include: {
        members: {
          select: {
            userId: true,
            role: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                isAdmin: true,
              },
            },
          },
        },
        _count: {
          select: {
            cases: true,
            members: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    // Map projects and compute isManagerOfProject
    const mappedProjects = await Promise.all(
      projects.map(async (project) => {
        const userMembership = project.members.find((m) => m.userId === currentUserId)
        const isManagerOfProject = Boolean(
          userMembership && (userMembership.role === 'MANAGER' || userMembership.role === 'OWNER')
        )

        // Count work logs tied to cases in this project or tagged with project ID
        const caseIds = await prisma.caseProject.findMany({
          where: { projectId: project.id },
          select: { caseId: true, case: { select: { fileNumber: true } } },
        })

        const fileNumbers = caseIds.map((cp) => cp.case?.fileNumber).filter(Boolean) as string[]

        const logs = await prisma.workLog.findMany({
          where: {
            fileNumber: { in: fileNumbers.length > 0 ? fileNumbers : ['__NONE__'] },
          },
          select: { durationMinutes: true, isVerified: true },
        })

        const totalMinutes = logs.reduce((sum, log) => sum + log.durationMinutes, 0)
        const totalHours = (totalMinutes / 60).toFixed(1)

        return {
          id: project.id,
          name: project.name,
          description: project.description || 'No description provided',
          accentColor: project.accentColor || '#C4953A',
          isManagerOfProject,
          memberCount: project._count.members,
          caseCount: project._count.cases,
          totalWorkLogs: logs.length,
          totalHours,
          createdAt: project.createdAt,
        }
      })
    )

    // Sort projects so that projects managed by the current user appear on TOP
    mappedProjects.sort((a, b) => {
      if (a.isManagerOfProject && !b.isManagerOfProject) return -1
      if (!a.isManagerOfProject && b.isManagerOfProject) return 1
      return 0
    })

    return NextResponse.json({ projects: mappedProjects, total: mappedProjects.length })
  } catch (error) {
    console.error('Projects fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}
