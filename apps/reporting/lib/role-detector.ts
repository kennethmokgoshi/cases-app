import { prisma } from '@zenowethu/database'
import { UserRole, roleDashboardMap } from './roles'

export async function detectUserRole(userId: string): Promise<UserRole> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isAdmin: true,
      role: true,
      userType: true,
    },
  })

  if (!user) return 'staff'

  // Role hierarchy: admin > finance > manager > executive > staff
  // Based on actual database fields: isAdmin (boolean) and role (string)
  if (user.isAdmin) return 'admin'

  // Check role field for manager, executive, or finance roles
  const roleUpper = user.role?.toUpperCase() || ''

  if (roleUpper.includes('MANAGER') || roleUpper.includes('SENIOR')) {
    return 'manager'
  }

  if (roleUpper.includes('EXECUTIVE') || roleUpper.includes('EXEC')) {
    return 'executive'
  }

  if (roleUpper.includes('FINANCE')) {
    return 'finance'
  }

  return 'staff'
}

