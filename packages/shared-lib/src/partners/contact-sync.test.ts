import { describe, it, expect } from 'vitest';
import { planContactSync } from './contact-sync';

describe('planContactSync', () => {
    it('copies branch details onto a referrer that has none', () => {
        const fills = planContactSync(
            { email: 'bree@partner.example', phone: '011 222 3333' },
            { email: null, cellNumber: null }
        );

        expect(fills).toEqual([
            { target: 'REFERRER', field: 'email', value: 'bree@partner.example' },
            { target: 'REFERRER', field: 'cellNumber', value: '011 222 3333' },
        ]);
    });

    it('copies referrer details onto a branch that has none', () => {
        const fills = planContactSync(
            { email: null, phone: null },
            { email: 'nomsa@partner.example', cellNumber: '083 555 4444' }
        );

        expect(fills).toEqual([
            { target: 'BRANCH', field: 'email', value: 'nomsa@partner.example' },
            { target: 'BRANCH', field: 'phone', value: '083 555 4444' },
        ]);
    });

    it('maps a branch phone onto a referrer cellNumber and back', () => {
        expect(planContactSync({ phone: '011 222 3333' }, {})).toEqual([
            { target: 'REFERRER', field: 'cellNumber', value: '011 222 3333' },
        ]);
        expect(planContactSync({}, { cellNumber: '083 555 4444' })).toEqual([
            { target: 'BRANCH', field: 'phone', value: '083 555 4444' },
        ]);
    });

    it('never overwrites a value that is already set and different', () => {
        const fills = planContactSync(
            { email: 'branch@partner.example', phone: '011 222 3333' },
            { email: 'referrer@personal.example', cellNumber: '083 555 4444' }
        );

        expect(fills).toEqual([]);
    });

    it('fills each channel independently', () => {
        const fills = planContactSync(
            { email: 'bree@partner.example', phone: null },
            { email: null, cellNumber: '083 555 4444' }
        );

        expect(fills).toEqual([
            { target: 'REFERRER', field: 'email', value: 'bree@partner.example' },
            { target: 'BRANCH', field: 'phone', value: '083 555 4444' },
        ]);
    });

    it('does nothing when both sides are blank', () => {
        expect(planContactSync({ email: null, phone: null }, { email: null, cellNumber: null })).toEqual([]);
    });

    it('treats whitespace-only values as blank and trims what it copies', () => {
        const fills = planContactSync({ email: '  bree@partner.example  ' }, { email: '   ' });
        expect(fills).toEqual([
            { target: 'REFERRER', field: 'email', value: 'bree@partner.example' },
        ]);
    });

    it('tolerates missing fields entirely', () => {
        expect(planContactSync({}, {})).toEqual([]);
    });
});
