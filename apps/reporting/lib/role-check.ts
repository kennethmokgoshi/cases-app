import { UserRole } from './roles'

export function canAccessDashboard(userRole: UserRole, requiredRole: UserRole): boolean {
  const roleHierarchy: Record<UserRole, number> = {
    staff: 1,
    finance: 2,
    manager: 3,
    executive: 4,
    admin: 5,
  }

  return roleHierarchy[userRole] >= roleHierarchy[requiredRole]
}

export function getDashboardTitle(role: UserRole): string {
  const titles: Record<UserRole, string> = {
    staff: 'Staff Dashboard',
    manager: 'Team Dashboard',
    finance: 'Finance Dashboard',
    executive: 'Executive Dashboard',
    admin: 'Admin Dashboard',
  }

  return titles[role]
}

export function getDashboardDescription(role: UserRole): string {
  const descriptions: Record<UserRole, string> = {
    staff: 'Track your daily activities and presence',
    manager: 'Manage your team\'s activities and workload',
    finance: 'Monitor financial performance and invoicing',
    executive: 'Executive overview of all operations',
    admin: 'System administration and monitoring',
  }

  return descriptions[role]
}
