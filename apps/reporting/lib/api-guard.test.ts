import { describe, it, expect } from 'vitest'
import { verifyStaffApiAccess } from './api-guard'

describe('verifyStaffApiAccess API Guard', () => {
  it('returns 401 Unauthorized if session is missing or unauthenticated', () => {
    const response = verifyStaffApiAccess(null)
    expect(response).not.toBeNull()
    expect(response?.status).toBe(401)
  })

  it('returns 403 Forbidden if user is not a staff member', () => {
    const session = {
      user: {
        id: 'user-1',
        email: 'partner@external.com',
        userType: 'B2B_PARTNER',
      },
    }
    const response = verifyStaffApiAccess(session)
    expect(response).not.toBeNull()
    expect(response?.status).toBe(403)
  })

  it('returns null (allowed) for valid Zenowethu staff members', () => {
    const session = {
      user: {
        id: 'staff-1',
        email: 'employee@zenowethu.co.za',
        userType: 'STAFF',
      },
    }
    const response = verifyStaffApiAccess(session)
    expect(response).toBeNull()
  })
})
