import { describe, it, expect } from 'vitest';
import { checkPoaReadiness, isFlagRemovalService, parseServices } from './poa-readiness';

const DC = { dcName: 'Some DC', dcNcrdcNo: 'NCRDC1234', dcPhone: '0820000000' };

describe('parseServices', () => {
    it('parses JSON arrays, plain strings and null', () => {
        expect(parseServices('["Debt Review Flag Removal"]')).toEqual(['Debt Review Flag Removal']);
        expect(parseServices('Debt Review Flag Removal')).toEqual(['Debt Review Flag Removal']);
        expect(parseServices(null)).toEqual([]);
    });
});

describe('isFlagRemovalService', () => {
    it('detects flag removal case-insensitively', () => {
        expect(isFlagRemovalService('["debt review FLAG removal"]')).toBe(true);
        expect(isFlagRemovalService('["Credit Repair"]')).toBe(false);
    });
});

describe('checkPoaReadiness', () => {
    it('blocks a standard flag-removal POA when DC details are missing (DHS not run)', () => {
        const r = checkPoaReadiness({ type: 'STANDARD', services: '["Debt Review Flag Removal"]' });
        expect(r.blocked).toBe(true);
        expect(r.blockReason).toMatch(/DHS/);
        expect(r.missingDcFields).toContain('NCRDC registration number');
    });

    it('blocks when only the NCRDC number is missing', () => {
        const r = checkPoaReadiness({
            type: 'STANDARD', services: '["Debt Review Flag Removal"]', dcName: 'Some DC',
        });
        expect(r.blocked).toBe(true);
    });

    it('allows a flag-removal POA once DHS has filled the DC details', () => {
        const r = checkPoaReadiness({ type: 'STANDARD', services: '["Debt Review Flag Removal"]', ...DC });
        expect(r.blocked).toBe(false);
        expect(r.warnings).toEqual([]);
    });

    it('does not block a missing counsellor phone for flag removal', () => {
        const r = checkPoaReadiness({
            type: 'STANDARD', services: '["Debt Review Flag Removal"]', dcName: 'Some DC', dcNcrdcNo: 'NCRDC1',
        });
        expect(r.blocked).toBe(false);
        expect(r.warnings[0]).toMatch(/Counsellor contact number/);
    });

    it('never blocks the Wesbank POA, even for flag removal with no DC details', () => {
        const r = checkPoaReadiness({ type: 'WESBANK', services: '["Debt Review Flag Removal"]' });
        expect(r.blocked).toBe(false);
        expect(r.missingDcFields).toEqual([]);
    });

    it('only warns (does not block) for non flag-removal services', () => {
        const r = checkPoaReadiness({ type: 'STANDARD', services: '["Credit Repair"]' });
        expect(r.blocked).toBe(false);
        expect(r.warnings).toHaveLength(1);
    });
});
