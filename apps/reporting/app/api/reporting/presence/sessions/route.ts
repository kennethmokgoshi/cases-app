import { auth } from '@/lib/auth'
import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { canAccessDashboard } from '@/lib/role-check'
import { verifyStaffApiAccess } from '@/lib/api-guard'

export async function GET(request: Request) {
  const session = await auth()
  const authError = verifyStaffApiAccess(session)
  if (authError) return authError

  try {
    const url = new URL(request.url)
    const targetUserId = url.searchParams.get('userId')
    const role = (session!.user as any)?.reportingRole || 'staff'

    let queryUserId = session!.user.id
    if (targetUserId && targetUserId !== session!.user.id) {
      if (!canAccessDashboard(role, 'manager')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      queryUserId = targetUserId
    }

    // Fetch sessions
    const sessions = await prisma.$queryRawUnsafe(`
      SELECT * FROM "EmployeeSession"
      WHERE "userId" = '${queryUserId}'
      ORDER BY "loginAt" DESC
      LIMIT 100
    `) as any[]

    const isExecutiveOrAdmin = role === 'executive' || role === 'admin'

    if (sessions.length === 0) {
      return NextResponse.json({
        sessions: [],
        stats: {
          totalSessions: 0,
          longestMinutes: 0,
          shortestMinutes: 0,
          averageMinutes: 0,
        },
        predictions: isExecutiveOrAdmin ? {
          dayHours: 8,
          weekHours: 40,
          monthHours: 176,
          threeMonthHours: 528,
        } : null
      })
    }

    // Process session durations
    let totalMinutes = 0
    let longestMinutes = 0
    let shortestMinutes = Infinity
    let validSessionCount = 0

    const processedSessions = sessions.map((sess) => {
      const login = new Date(sess.loginAt)
      const logout = sess.logoutAt ? new Date(sess.logoutAt) : new Date()
      
      const durationMs = logout.getTime() - login.getTime()
      const durationMinutes = Math.max(1, Math.round(durationMs / 1000 / 60))

      totalMinutes += durationMinutes
      if (durationMinutes > longestMinutes) longestMinutes = durationMinutes
      if (durationMinutes < shortestMinutes) shortestMinutes = durationMinutes
      validSessionCount++

      return {
        id: sess.id,
        loginAt: sess.loginAt,
        logoutAt: sess.logoutAt,
        durationMinutes,
      }
    })

    const averageMinutes = validSessionCount > 0 ? Math.round(totalMinutes / validSessionCount) : 0
    const finalShortest = shortestMinutes === Infinity ? 0 : shortestMinutes

    // Predictions (in hours) based on average daily session duration - only for executive and admin
    let predictions = null
    if (isExecutiveOrAdmin) {
      const avgDailyHours = averageMinutes > 0 ? averageMinutes / 60 : 8 // Default to 8h if no history
      predictions = {
        dayHours: Number(avgDailyHours.toFixed(1)),
        weekHours: Number((avgDailyHours * 5).toFixed(1)),
        monthHours: Number((avgDailyHours * 22).toFixed(1)),
        threeMonthHours: Number((avgDailyHours * 66).toFixed(1)),
      }
    }

    return NextResponse.json({
      sessions: processedSessions,
      stats: {
        totalSessions: validSessionCount,
        longestMinutes,
        shortestMinutes: finalShortest,
        averageMinutes,
      },
      predictions,
    })
  } catch (error) {
    console.error('Sessions fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch sessions data' }, { status: 500 })
  }
}
