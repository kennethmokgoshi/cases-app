import { describe, it, expect } from 'vitest';
import { resolveClientIdNumberUpdate, resolveClientNameUpdate } from './client-identity-guard';

const TSHEPO = '9202204720082';
const THABO = '8001015009087';

describe('resolveClientIdNumberUpdate', () => {
    it("refuses to replace an existing ID with a different one", () => {
        // The regression this guard exists for: a stranger's document reaching a
        // case must not rewrite that case client's own ID number.
        const result = resolveClientIdNumberUpdate({
            currentIdNumber: TSHEPO,
            proposedIdNumber: THABO,
            isVerified: true,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('BLOCKED_WOULD_REPLACE');
        expect(result.warning).toContain(THABO);
        expect(result.warning).toContain(TSHEPO);
    });

    it('refuses even when the analysis claims the ID was verified', () => {
        const result = resolveClientIdNumberUpdate({
            currentIdNumber: TSHEPO,
            proposedIdNumber: THABO,
            isVerified: true,
        });
        expect(result.allowed).toBe(false);
    });

    it('fills an empty ID when the analysis was cross-checked', () => {
        const result = resolveClientIdNumberUpdate({
            currentIdNumber: null,
            proposedIdNumber: THABO,
            isVerified: true,
        });
        expect(result.allowed).toBe(true);
        expect(result.value).toBe(THABO);
        expect(result.reason).toBe('FILLED_EMPTY');
    });

    it('does not fill an empty ID from an unverified analysis', () => {
        const result = resolveClientIdNumberUpdate({
            currentIdNumber: '',
            proposedIdNumber: THABO,
            isVerified: false,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('BLOCKED_UNVERIFIED');
    });

    it('treats a formatting-only difference as unchanged', () => {
        const result = resolveClientIdNumberUpdate({
            currentIdNumber: '800101 5009 087',
            proposedIdNumber: THABO,
            isVerified: true,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('UNCHANGED');
        expect(result.warning).toBeNull();
    });

    it('does nothing when the analysis proposed no ID', () => {
        const result = resolveClientIdNumberUpdate({
            currentIdNumber: TSHEPO,
            proposedIdNumber: null,
            isVerified: true,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('NOTHING_PROPOSED');
    });
});

describe('resolveClientNameUpdate', () => {
    it('refuses to replace an existing name', () => {
        const result = resolveClientNameUpdate({
            currentValue: 'Tshepo',
            proposedValue: 'Thabo',
            isVerified: true,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('BLOCKED_WOULD_REPLACE');
    });

    it('fills an empty name when verified', () => {
        const result = resolveClientNameUpdate({
            currentValue: null,
            proposedValue: 'Tshepo',
            isVerified: true,
        });
        expect(result.allowed).toBe(true);
        expect(result.value).toBe('Tshepo');
    });

    it('ignores case-only differences', () => {
        const result = resolveClientNameUpdate({
            currentValue: 'Tshepo',
            proposedValue: 'TSHEPO',
            isVerified: true,
        });
        expect(result.reason).toBe('UNCHANGED');
    });
});
