import { NextResponse } from 'next/server'
import { isStaffUser } from './staff-guard'

export function verifyStaffApiAccess(session: any) {
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 })
  }

  if (!isStaffUser(session.user)) {
    return NextResponse.json(
      { error: 'Not Authorized: Access restricted to @zenowethu staff members only' },
      { status: 403 }
    )
  }

  return null
}
