export interface StaffUserCheck {
  email?: string | null
  userType?: string | null
}

/**
 * Validates whether a user is an authorized internal Zenowethu staff member.
 * A user is considered a staff member if:
 * 1. userType is 'STAFF' (case-insensitive) OR
 * 2. email domain contains '@zenowethu' (e.g. @zenowethu.co.za or @zenowethu.com)
 *
 * Accounts explicitly marked as non-staff (such as 'B2B_PARTNER', 'REFERRER', 'CONSUMER', 'CLIENT')
 * without a @zenowethu email domain are denied access.
 */
export function isStaffUser(user?: StaffUserCheck | null): boolean {
  if (!user) return false

  const email = (user.email || '').toLowerCase().trim()
  const userType = (user.userType || '').toUpperCase().trim()

  const isZenowethuDomain = email.endsWith('@zenowethu.co.za') ||
                            email.endsWith('@zenowethu.com') ||
                            email.includes('@zenowethu.')

  const isStaffUserType = userType === 'STAFF'

  // Non-staff portal user types (e.g. B2B_PARTNER, REFERRER, CONSUMER) without a @zenowethu email are rejected
  if (['B2B_PARTNER', 'REFERRER', 'CONSUMER', 'CLIENT'].includes(userType) && !isZenowethuDomain) {
    return false
  }

  return isZenowethuDomain || isStaffUserType
}
