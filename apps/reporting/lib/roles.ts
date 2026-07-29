export type UserRole = 'staff' | 'manager' | 'executive' | 'admin' | 'finance'

export const roleDashboardMap: Record<UserRole, string> = {
  staff: '/staff',
  manager: '/manager',
  executive: '/executive',
  admin: '/admin',
  finance: '/finance',
}
