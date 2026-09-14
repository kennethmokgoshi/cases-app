import { describe, it, expect } from 'vitest';
import { parseCsvRows, parseBranchCsv, branchCsvTemplate } from './partner-branch-csv';

describe('parseCsvRows', () => {
    it('splits plain rows and cells', () => {
        expect(parseCsvRows('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
    });

    it('keeps commas and newlines inside quoted cells', () => {
        expect(parseCsvRows('a,b\n"1, one","line\nbreak"')).toEqual([
            ['a', 'b'],
            ['1, one', 'line\nbreak'],
        ]);
    });

    it('treats a doubled quote as an escaped quote', () => {
        expect(parseCsvRows('a\n"say ""hi"""')).toEqual([['a'], ['say "hi"']]);
    });

    it('handles CRLF line endings and trailing newlines', () => {
        expect(parseCsvRows('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
    });
});

describe('parseBranchCsv', () => {
    it('maps partner header wording onto canonical fields', () => {
        const result = parseBranchCsv(
            'Branch,Contact Person,Email Address,Tel,Town\nMthata,Nomsa Dlamini,mthata@partner.example,047 000 0000,Mthatha'
        );

        expect(result.errors).toEqual([]);
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].errors).toEqual([]);
        expect(result.rows[0].values).toEqual({
            name: 'Mthata',
            contactPerson: 'Nomsa Dlamini',
            email: 'mthata@partner.example',
            phone: '047 000 0000',
            city: 'Mthatha' });
    });

    it('rejects a file with no branch name column', () => {
        const result = parseBranchCsv('Email,Phone\na@b.com,0821234567');
        expect(result.errors[0]).toContain('required');
        expect(result.rows).toEqual([]);
    });

    it('reports an empty file', () => {
        expect(parseBranchCsv('').errors[0]).toContain('empty');
    });

    it('reports a header row with no data rows', () => {
        expect(parseBranchCsv('Branch,Email').errors[0]).toContain('no data rows');
    });

    it('flags a malformed email rather than importing it', () => {
        const result = parseBranchCsv('Branch,Email\nBree,not-an-email');
        expect(result.rows[0].errors).toHaveLength(1);
        expect(result.rows[0].errors[0]).toContain('not a valid email');
    });

    it('flags a phone number that is too short to be real', () => {
        const result = parseBranchCsv('Branch,Phone\nBree,12345');
        expect(result.rows[0].errors[0]).toContain('does not look like a phone number');
    });

    it('accepts a spaced SA number', () => {
        const result = parseBranchCsv('Branch,Phone\nBree,011 222 3333');
        expect(result.rows[0].errors).toEqual([]);
        expect(result.rows[0].values.phone).toBe('011 222 3333');
    });

    it('flags a row with a missing branch name', () => {
        const result = parseBranchCsv('Branch,Email\n,a@b.com');
        expect(result.rows[0].errors[0]).toContain('Branch name is missing');
    });

    it('collects unrecognised headers instead of failing', () => {
        const result = parseBranchCsv('Branch,Region Manager Mobile\nBree,0821234567');
        expect(result.unknownHeaders).toEqual(['Region Manager Mobile']);
        expect(result.rows[0].errors).toEqual([]);
    });

    it('omits blank cells so an import never overwrites a value with nothing', () => {
        const result = parseBranchCsv('Branch,Email,Phone\nBree,,011 222 3333');
        expect(result.rows[0].values).not.toHaveProperty('email');
        expect(result.rows[0].values.phone).toBe('011 222 3333');
    });

    it('numbers rows by their line in the source file', () => {
        const result = parseBranchCsv('Branch\nBree\nEloff');
        expect(result.rows.map((r) => r.line)).toEqual([2, 3]);
    });
});

describe('branchCsvTemplate', () => {
    it('emits a header row on its own when no branches are given', () => {
        expect(branchCsvTemplate().split('\n')).toHaveLength(1);
    });

    it('pre-fills the given branch names and quotes names containing a comma', () => {
        const lines = branchCsvTemplate(['Bree', 'Paul Kruger 1', 'Smith, Jones & Co']).split('\n');
        expect(lines[1]).toMatch(/^Bree,/);
        expect(lines[2]).toMatch(/^Paul Kruger 1,/);
        expect(lines[3]).toMatch(/^"Smith, Jones & Co",/);
    });

    it('round-trips through the parser', () => {
        const parsed = parseBranchCsv(branchCsvTemplate(['Bree']));
        expect(parsed.errors).toEqual([]);
        expect(parsed.rows[0].values.name).toBe('Bree');
    });
});
