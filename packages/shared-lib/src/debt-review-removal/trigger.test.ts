import { describe, it, expect } from 'vitest';
import {
    getRemovalPaths,
    matchesDocType,
    PATH_A_TO_B,
    PATH_C_TO_G,
    PATH_D4_TO_F2,
    PATH_D4_TO_G,
    PATH_D4_TO_F1,
    PATH_ALREADY_EXITABLE,
    DOC_TYPES,
} from './removal-paths';

// ─── matchesDocType ────────────────────────────────────────────────────────────

describe('matchesDocType', () => {
    it('exact match is true', () => {
        expect(matchesDocType('FORM_19', 'FORM_19')).toBe(true);
    });

    it('alias match: CERTIFIED_FORM_19 matches FORM_19 requirement', () => {
        expect(matchesDocType('CERTIFIED_FORM_19', 'FORM_19')).toBe(true);
    });

    it('alias match: COURT_ORDER matches COURT_ORDER_GRANTED requirement', () => {
        expect(matchesDocType('COURT_ORDER', 'COURT_ORDER_GRANTED')).toBe(true);
    });

    it('alias match: PAID_UP_LETTER (singular) matches PAID_UP_LETTERS', () => {
        expect(matchesDocType('PAID_UP_LETTER', 'PAID_UP_LETTERS')).toBe(true);
    });

    it('case-insensitive', () => {
        expect(matchesDocType('form_19', 'FORM_19')).toBe(true);
    });

    it('non-matching returns false', () => {
        expect(matchesDocType('ID', 'FORM_19')).toBe(false);
    });

    it('POA matches ZENOWETHU_POA requirement via alias', () => {
        expect(matchesDocType('ZENOWETHU_POA', 'POA')).toBe(true);
    });
});

// ─── getRemovalPaths ──────────────────────────────────────────────────────────

describe('getRemovalPaths', () => {
    it('status A returns A→B path', () => {
        const paths = getRemovalPaths('A');
        expect(paths).toHaveLength(1);
        expect(paths[0]).toBe(PATH_A_TO_B);
    });

    it('status C returns C→G path', () => {
        const paths = getRemovalPaths('C');
        expect(paths).toHaveLength(1);
        expect(paths[0]).toBe(PATH_C_TO_G);
    });

    it('status D4 returns 3 candidate paths', () => {
        const paths = getRemovalPaths('D4');
        expect(paths).toHaveLength(3);
        expect(paths).toContain(PATH_D4_TO_G);
        expect(paths).toContain(PATH_D4_TO_F1);
        expect(paths).toContain(PATH_D4_TO_F2);
    });

    it('status F1 returns already-exitable path', () => {
        const paths = getRemovalPaths('F1');
        expect(paths).toHaveLength(1);
        expect(paths[0]).toBe(PATH_ALREADY_EXITABLE);
    });

    it('status F2 returns already-exitable path', () => {
        const paths = getRemovalPaths('F2');
        expect(paths[0]).toBe(PATH_ALREADY_EXITABLE);
    });

    it('status G returns already-exitable path', () => {
        const paths = getRemovalPaths('G');
        expect(paths[0]).toBe(PATH_ALREADY_EXITABLE);
    });

    it('unknown status returns empty array', () => {
        expect(getRemovalPaths('X')).toHaveLength(0);
    });

    it('null/undefined returns empty array', () => {
        expect(getRemovalPaths(null)).toHaveLength(0);
        expect(getRemovalPaths(undefined)).toHaveLength(0);
    });

    it('lowercase status is normalised', () => {
        expect(getRemovalPaths('d4')).toHaveLength(3);
        expect(getRemovalPaths('f2')).toHaveLength(1);
    });
});

// ─── Path document requirements ───────────────────────────────────────────────

describe('PATH_A_TO_B required documents', () => {
    it('requires Form 16, Form 17.2(a) and affordability assessment', () => {
        expect(PATH_A_TO_B.requiredDocTypes).toContain(DOC_TYPES.FORM_16);
        expect(PATH_A_TO_B.requiredDocTypes).toContain(DOC_TYPES.FORM_17_2A);
        expect(PATH_A_TO_B.requiredDocTypes).toContain(DOC_TYPES.AFFORDABILITY_ASSESSMENT);
    });
});

describe('PATH_C_TO_G required documents', () => {
    it('requires Notice of Motion, Founding Affidavit, Court Order', () => {
        expect(PATH_C_TO_G.requiredDocTypes).toContain(DOC_TYPES.NOTICE_OF_MOTION);
        expect(PATH_C_TO_G.requiredDocTypes).toContain(DOC_TYPES.FOUNDING_AFFIDAVIT);
        expect(PATH_C_TO_G.requiredDocTypes).toContain(DOC_TYPES.COURT_ORDER_GRANTED);
    });
});

describe('PATH_D4_TO_F2 required documents', () => {
    it('requires Certified Form 19 and Paid-up Letters', () => {
        expect(PATH_D4_TO_F2.requiredDocTypes).toContain(DOC_TYPES.CERTIFIED_FORM_19);
        expect(PATH_D4_TO_F2.requiredDocTypes).toContain(DOC_TYPES.PAID_UP_LETTERS);
        expect(PATH_D4_TO_F2.requiredDocTypes).not.toContain(DOC_TYPES.COURT_ORDER_GRANTED);
    });
});

describe('PATH_D4_TO_F1 required documents', () => {
    it('requires Form 19, paid-up letters, Form 17.2(c) and court order', () => {
        expect(PATH_D4_TO_F1.requiredDocTypes).toContain(DOC_TYPES.CERTIFIED_FORM_19);
        expect(PATH_D4_TO_F1.requiredDocTypes).toContain(DOC_TYPES.PAID_UP_LETTERS);
        expect(PATH_D4_TO_F1.requiredDocTypes).toContain(DOC_TYPES.FORM_17_2C);
        expect(PATH_D4_TO_F1.requiredDocTypes).toContain(DOC_TYPES.COURT_ORDER_GRANTED);
    });
});

describe('PATH_ALREADY_EXITABLE', () => {
    it('has no required documents', () => {
        expect(PATH_ALREADY_EXITABLE.requiredDocTypes).toHaveLength(0);
    });

    it('is flagged as alreadyExitable', () => {
        expect(PATH_ALREADY_EXITABLE.alreadyExitable).toBe(true);
    });
});
