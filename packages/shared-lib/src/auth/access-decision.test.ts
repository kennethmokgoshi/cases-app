import { describe, it, expect } from 'vitest';
import { decideAccess } from './access-decision';

const staff = { id: 'u1', userType: 'STAFF' };

describe('decideAccess', () => {
    it('401s with no session user', () => {
        expect(decideAccess(null, 'staff')).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
        expect(decideAccess({ userType: 'STAFF' }, 'staff')).toMatchObject({ ok: false, status: 401 });
    });

    it('allows STAFF at the staff level', () => {
        expect(decideAccess(staff, 'staff')).toEqual({ ok: true });
    });

    it('denies referrer, B2B partner and missing userType', () => {
        for (const userType of ['REFERRER', 'B2B_PARTNER', undefined, null, '']) {
            expect(decideAccess({ id: 'u', userType, isAdmin: true }, 'staff')).toMatchObject({
                ok: false,
                status: 403,
            });
        }
    });

    it('requires a manager-type flag at the manager level', () => {
        expect(decideAccess(staff, 'manager')).toMatchObject({ ok: false, status: 403 });
        for (const flag of ['isAdmin', 'isExecutive', 'isSeniorManager', 'isManager']) {
            expect(decideAccess({ ...staff, [flag]: true }, 'manager')).toEqual({ ok: true });
        }
    });

    it('requires isAdmin at the admin level', () => {
        expect(decideAccess({ ...staff, isManager: true }, 'admin')).toMatchObject({ ok: false, status: 403 });
        expect(decideAccess({ ...staff, isAdmin: true }, 'admin')).toEqual({ ok: true });
    });
});
