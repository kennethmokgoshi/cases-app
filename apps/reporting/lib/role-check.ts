import { UserRole, getUserLevel } from './roles'

export function canAccessDashboard(userRole: UserRole, requiredRole: UserRole): boolean {
  return getUserLevel(userRole) >= getUserLevel(requiredRole)
}

/**
 * Visibility rules across levels:
 * Level 5 (Admin): Highest level, sees all levels (5, 4, 3, 2, 1)
 * Level 4 (Executive): Sees Level 4 (other Executives), Level 3, 2, 1. Cannot see Admin (Level 5).
 * Level 3 (Senior Manager): Sees Level 3 (other Senior Managers), Level 2, 1. Cannot see Executive (4) or Admin (5).
 * Level 2 (Manager): Sees Level 2 (other Managers), Level 1. Cannot see Senior Manager (3), Executive (4), or Admin (5).
 * Level 1 (Staff & Finance): Sees Level 1.
 */
export function canViewUser(viewerRole: UserRole | string, targetRole: UserRole | string): boolean {
  const viewerLevel = getUserLevel(viewerRole)
  const targetLevel = getUserLevel(targetRole)

  if (viewerLevel === 5) return true // Highest level sees all levels
  return targetLevel <= viewerLevel
}

/**
 * Formats performer details based on level comparison.
 * If performerLevel > viewerLevel:
 * Displays "Senior Member" without describing role.
 */
export function formatPerformerName(
  viewerRole: UserRole | string,
  performerRole: UserRole | string,
  performerName: string
): { displayName: string; displayRole: string | null; isAnonymized: boolean } {
  const viewerLevel = getUserLevel(viewerRole)
  const performerLevel = getUserLevel(performerRole)

  if (performerLevel > viewerLevel) {
    return {
      displayName: 'Senior Member',
      displayRole: null,
      isAnonymized: true,
    }
  }

  return {
    displayName: performerName,
    displayRole: String(performerRole),
    isAnonymized: false,
  }
}

export function getDashboardTitle(role: UserRole): string {
  const titles: Record<UserRole, string> = {
    unauthorized: 'Not Authorized',
    staff: 'Staff Dashboard',
    finance: 'Finance Dashboard',
    manager: 'Team Dashboard',
    senior_manager: 'Senior Manager Dashboard',
    executive: 'Executive Dashboard',
    admin: 'Admin Dashboard',
  }

  return titles[role] ?? 'Dashboard'
}

export function getDashboardDescription(role: UserRole): string {
  const descriptions: Record<UserRole, string> = {
    unauthorized: 'Access restricted to internal staff members only',
    staff: 'Track your daily activities and presence',
    finance: 'Monitor financial performance and invoicing',
    manager: "Manage your team's activities and workload",
    senior_manager: 'Oversee department performance and manager teams',
    executive: 'Executive overview of all operations',
    admin: 'System administration and monitoring',
  }

  return descriptions[role] ?? ''
}

