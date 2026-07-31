import { describe, it, expect } from 'vitest'
import { isStaffUser } from './staff-guard'

describe('isStaffUser Guard', () => {
  it('returns true for users with @zenowethu.co.za email domain', () => {
    expect(isStaffUser({ email: 'john@zenowethu.co.za', userType: 'STAFF' })).toBe(true)
    expect(isStaffUser({ email: 'sarah@zenowethu.co.za', userType: undefined })).toBe(true)
  })

  it('returns true for users with @zenowethu.com or custom @zenowethu domain', () => {
    expect(isStaffUser({ email: 'admin@zenowethu.com', userType: 'STAFF' })).toBe(true)
    expect(isStaffUser({ email: 'support@zenowethu.net', userType: 'STAFF' })).toBe(true)
  })

  it('returns true for users with userType STAFF even if email domain is non-standard', () => {
    expect(isStaffUser({ email: 'internal.staff@company.co.za', userType: 'STAFF' })).toBe(true)
  })

  it('returns false for external B2B partner users without @zenowethu email', () => {
    expect(isStaffUser({ email: 'partner@externalbank.com', userType: 'B2B_PARTNER' })).toBe(false)
  })

  it('returns false for referrer portal users without @zenowethu email', () => {
    expect(isStaffUser({ email: 'referrer@agent.co.za', userType: 'REFERRER' })).toBe(false)
  })

  it('returns false for debt review consumer/client users', () => {
    expect(isStaffUser({ email: 'client@gmail.com', userType: 'CONSUMER' })).toBe(false)
    expect(isStaffUser({ email: 'client@outlook.com', userType: 'CLIENT' })).toBe(false)
  })

  it('returns false for null, undefined, or empty user input', () => {
    expect(isStaffUser(null)).toBe(false)
    expect(isStaffUser(undefined)).toBe(false)
    expect(isStaffUser({})).toBe(false)
  })
})
