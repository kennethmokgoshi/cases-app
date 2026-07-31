export type UserRole =
  | 'staff'
  | 'manager'
  | 'senior_manager'
  | 'executive'
  | 'admin'
  | 'finance'
  | 'unauthorized'

export const ROLE_LEVELS: Record<UserRole, number> = {
  unauthorized: 0,
  staff: 1,
  finance: 1,
  manager: 2,
  senior_manager: 3,
  executive: 4,
  admin: 5,
}

export function getUserLevel(role: UserRole | string): number {
  if (!role) return 0
  const normalized = role.toLowerCase() as UserRole
  return ROLE_LEVELS[normalized] ?? 0
}

export const roleDashboardMap: Record<UserRole, string> = {
  staff: '/staff',
  finance: '/finance',
  manager: '/manager',
  senior_manager: '/manager',
  executive: '/executive',
  admin: '/admin',
  unauthorized: '/',
}

