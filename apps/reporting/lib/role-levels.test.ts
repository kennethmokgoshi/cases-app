import { describe, it, expect } from 'vitest'
import { getUserLevel, UserRole } from './roles'
import { canViewUser, formatPerformerName } from './role-check'

describe('Role Hierarchy Levels & Visibility Rules', () => {
  it('correctly maps user roles to numeric levels (1 to 5)', () => {
    expect(getUserLevel('staff')).toBe(1)
    expect(getUserLevel('finance')).toBe(1)
    expect(getUserLevel('manager')).toBe(2)
    expect(getUserLevel('senior_manager')).toBe(3)
    expect(getUserLevel('executive')).toBe(4)
    expect(getUserLevel('admin')).toBe(5)
    expect(getUserLevel('unauthorized')).toBe(0)
  })

  it('enforces visibility rules across levels', () => {
    // Level 5 (Admin) can see all levels
    expect(canViewUser('admin', 'admin')).toBe(true)
    expect(canViewUser('admin', 'executive')).toBe(true)
    expect(canViewUser('admin', 'senior_manager')).toBe(true)
    expect(canViewUser('admin', 'manager')).toBe(true)
    expect(canViewUser('admin', 'staff')).toBe(true)

    // Level 4 (Executive) sees Executives, Senior Managers, Managers, Staff, but NOT Admin
    expect(canViewUser('executive', 'admin')).toBe(false)
    expect(canViewUser('executive', 'executive')).toBe(true)
    expect(canViewUser('executive', 'senior_manager')).toBe(true)
    expect(canViewUser('executive', 'manager')).toBe(true)
    expect(canViewUser('executive', 'staff')).toBe(true)

    // Level 3 (Senior Manager) sees Senior Managers, Managers, Staff, but NOT Executive or Admin
    expect(canViewUser('senior_manager', 'admin')).toBe(false)
    expect(canViewUser('senior_manager', 'executive')).toBe(false)
    expect(canViewUser('senior_manager', 'senior_manager')).toBe(true)
    expect(canViewUser('senior_manager', 'manager')).toBe(true)
    expect(canViewUser('senior_manager', 'staff')).toBe(true)

    // Level 2 (Manager) sees Managers, Staff, but NOT Senior Manager, Executive, or Admin
    expect(canViewUser('manager', 'admin')).toBe(false)
    expect(canViewUser('manager', 'executive')).toBe(false)
    expect(canViewUser('manager', 'senior_manager')).toBe(false)
    expect(canViewUser('manager', 'manager')).toBe(true)
    expect(canViewUser('manager', 'staff')).toBe(true)
  })

  it('anonymizes higher-level performers to "Senior Member" without describing role', () => {
    // Manager viewing Executive activity
    const anonResult = formatPerformerName('manager', 'executive', 'John Executive')
    expect(anonResult.isAnonymized).toBe(true)
    expect(anonResult.displayName).toBe('Senior Member')
    expect(anonResult.displayRole).toBeNull()

    // Manager viewing Senior Manager activity
    const anonResult2 = formatPerformerName('manager', 'senior_manager', 'Jane Senior')
    expect(anonResult2.isAnonymized).toBe(true)
    expect(anonResult2.displayName).toBe('Senior Member')
    expect(anonResult2.displayRole).toBeNull()

    // Manager viewing Staff activity (equal or lower level)
    const normalResult = formatPerformerName('manager', 'staff', 'Alice Staff')
    expect(normalResult.isAnonymized).toBe(false)
    expect(normalResult.displayName).toBe('Alice Staff')
    expect(normalResult.displayRole).toBe('staff')

    // Admin viewing Executive activity (Admin is level 5, Executive is level 4)
    const adminView = formatPerformerName('admin', 'executive', 'John Executive')
    expect(adminView.isAnonymized).toBe(false)
    expect(adminView.displayName).toBe('John Executive')
  })
})
