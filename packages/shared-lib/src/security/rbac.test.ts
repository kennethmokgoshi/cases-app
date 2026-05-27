import { describe, it, expect } from 'vitest';
import { hasRolePermission } from './rbac';

describe('RBAC', () => {
    it('should allow ADMIN all permissions', () => {
        expect(hasRolePermission('ADMIN', 'view:all_cases')).toBe(true);
        expect(hasRolePermission('ADMIN', 'edit:all_cases')).toBe(true);
        expect(hasRolePermission('ADMIN', 'delete:cases')).toBe(true);
        expect(hasRolePermission('ADMIN', 'manage:users')).toBe(true);
    });

    it('should restrict SALES to own cases', () => {
        expect(hasRolePermission('SALES', 'view:own_cases')).toBe(true);
        expect(hasRolePermission('SALES', 'view:all_cases')).toBe(false);
        expect(hasRolePermission('SALES', 'delete:cases')).toBe(false);
    });

    it('should default unknown roles to MEMBER', () => {
        expect(hasRolePermission('UNKNOWN', 'view:own_cases')).toBe(true);
        expect(hasRolePermission('UNKNOWN', 'view:all_cases')).toBe(false);
    });

    it('should handle missing roles', () => {
        expect(hasRolePermission(undefined as any, 'view:own_cases')).toBe(true);
        expect(hasRolePermission(null as any, 'view:all_cases')).toBe(false);
    });
});
