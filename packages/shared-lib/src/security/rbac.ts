export type Role = 'ADMIN' | 'SALES' | 'CONSULTANT' | 'AUDITOR' | 'MEMBER';

type Permission = 
    | 'view:all_cases' 
    | 'edit:all_cases'
    | 'delete:cases'
    | 'view:audit_logs'
    | 'view:finance'
    | 'edit:finance'
    | 'manage:users'
    | 'view:own_cases'
    | 'edit:own_cases';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
    ADMIN: [
        'view:all_cases', 'edit:all_cases', 'delete:cases', 
        'view:audit_logs', 'view:finance', 'edit:finance', 
        'manage:users', 'view:own_cases', 'edit:own_cases'
    ],
    AUDITOR: [
        'view:all_cases', 'view:audit_logs', 'view:finance'
    ],
    SALES: [
        'view:own_cases', 'edit:own_cases'
    ],
    CONSULTANT: [
        'view:own_cases', 'edit:own_cases', 'view:all_cases'
    ],
    MEMBER: [
        'view:own_cases'
    ]
};

export function hasRolePermission(userRole: string, permission: Permission): boolean {
    const role = (userRole?.toUpperCase() || 'MEMBER') as Role;
    const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS['MEMBER'];
    return permissions.includes(permission);
}
