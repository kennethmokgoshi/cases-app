import { prisma } from '@zenowethu/database'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { verifyStaffApiAccess } from '@/lib/api-guard'
import { normalizePresenceStatus, selectablePresenceStatusSchema } from '@/lib/presence-status'

export async function GET(request: Request) {
  const session = await auth()
  const authError = verifyStaffApiAccess(session)
  if (authError) return authError

  try {
    const presence = await prisma.employeePresence.findUnique({
      where: { userId: session!.user.id },
      select: { status: true, lastActivityAt: true, checkedInAt: true },
    })

    return NextResponse.json({
      status: normalizePresenceStatus(presence?.status),
      lastActivityAt: presence?.lastActivityAt ?? null,
      checkedInAt: presence?.checkedInAt ?? null,
    })
  } catch (error) {
    console.error('Presence status fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch presence status' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await auth()
  const authError = verifyStaffApiAccess(session)
  if (authError) return authError

  try {
    const body = await request.json().catch(() => null)
    const parsed = selectablePresenceStatusSchema.safeParse(body?.status)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid presence status' }, { status: 400 })
    }

    const status = parsed.data
    const now = new Date()

    // A user can only ever update their own presence — userId always comes from the
    // authenticated session, never from the request body.
    const presence = await prisma.employeePresence.upsert({
      where: { userId: session!.user.id },
      update: { status, lastActivityAt: now, checkedInAt: now },
      create: { userId: session!.user.id, status, lastActivityAt: now, checkedInAt: now },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    })

    return NextResponse.json({ success: true, presence })
  } catch (error) {
    console.error('Presence status update error:', error)
    return NextResponse.json({ error: 'Failed to update presence status' }, { status: 500 })
  }
}
