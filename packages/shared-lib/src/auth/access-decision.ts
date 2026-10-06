// Pure role-decision logic (no framework imports) so it is unit-testable.

export type GuardUser = {
    id?: string;
    userType?: string | null;
    isAdmin?: boolean | null;
    isExecutive?: boolean | null;
    isSeniorManager?: boolean | null;
    isManager?: boolean | null;
};

export type GuardLevel = 'staff' | 'manager' | 'admin';

/** Not a discriminated union: the apps compile with strict:false, which breaks narrowing. */
export type GuardDecision = { ok: boolean; status?: 401 | 403; error?: string };

export function decideAccess(user: GuardUser | null | undefined, level: GuardLevel): GuardDecision {
    if (!user?.id) return { ok: false, status: 401, error: 'Unauthorized' };
    if (user.userType !== 'STAFF') return { ok: false, status: 403, error: 'Forbidden' };

    if (level === 'admin' && user.isAdmin !== true) {
        return { ok: false, status: 403, error: 'Forbidden' };
    }
    if (
        level === 'manager' &&
        !(user.isAdmin || user.isExecutive || user.isSeniorManager || user.isManager)
    ) {
        return { ok: false, status: 403, error: 'Forbidden' };
    }
    return { ok: true };
}
