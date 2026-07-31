import { prisma } from '@zenowethu/database'
import { UserRole } from './roles'
import { isStaffUser } from './staff-guard'

export async function detectUserRole(userId: string): Promise<UserRole> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isAdmin: true,
      role: true,
      userType: true,
      email: true,
    },
  })

  if (!user || !isStaffUser(user)) return 'unauthorized'

  // Level 5: Admin
  if (user.isAdmin) return 'admin'

  const roleUpper = user.role?.toUpperCase() || ''

  // Level 4: Executive
  if (roleUpper.includes('EXECUTIVE') || roleUpper.includes('EXEC')) {
    return 'executive'
  }

  // Level 3: Senior Manager
  if (
    roleUpper.includes('SENIOR_MANAGER') ||
    roleUpper.includes('SENIOR MANAGER') ||
    (roleUpper.includes('SENIOR') && roleUpper.includes('MANAGER'))
  ) {
    return 'senior_manager'
  }

  // Level 2: Manager
  if (roleUpper.includes('MANAGER')) {
    return 'manager'
  }

  // Level 1: Finance
  if (roleUpper.includes('FINANCE')) {
    return 'finance'
  }

  // Level 1: Staff
  return 'staff'
}


