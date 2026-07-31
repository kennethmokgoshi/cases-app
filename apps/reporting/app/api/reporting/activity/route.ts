import { auth } from '@/lib/auth'
import { getUserActivitySignature } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { verifyStaffApiAccess } from '@/lib/api-guard'

export async function GET(request: Request) {
  const session = await auth()
  const authError = verifyStaffApiAccess(session)
  if (authError) return authError

  try {
    const url = new URL(request.url)
    const dateStr = url.searchParams.get('date')

    if (!dateStr) {
      return NextResponse.json({ error: 'Date parameter required' }, { status: 400 })
    }

    const date = new Date(dateStr)

    // Get auto-detected activity from database
    const signature = await getUserActivitySignature(session!.user.id, date)

    // Get manual work logs for the day
    const dayStart = new Date(date)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(date)
    dayEnd.setHours(23, 59, 59, 999)

    const workLogs = await prisma.workLog.findMany({
      where: {
        userId: session!.user.id,
        date: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Calculate totals
    const autoDetectedMinutes = signature.commentCount * 5 + signature.documentCount * 10
    const manualMinutes = workLogs.reduce((sum, log) => sum + log.durationMinutes, 0)
    const totalMinutes = autoDetectedMinutes + manualMinutes

    return NextResponse.json({
      date,
      autoDetected: {
        commentCount: signature.commentCount,
        documentCount: signature.documentCount,
        workflowLogCount: signature.workflowLogCount,
        notificationCount: signature.notificationCount,
        casesTouched: signature.casesTouched,
        estimatedMinutes: autoDetectedMinutes,
      },
      manualLogs: workLogs,
      totals: {
        estimatedMinutes: autoDetectedMinutes,
        loggedMinutes: manualMinutes,
        totalMinutes,
        totalHours: (totalMinutes / 60).toFixed(1),
      },
    })
  } catch (error) {
    console.error('Activity fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 })
  }
}