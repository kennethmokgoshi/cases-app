import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseDhsXls, dhsRowsToCsv } from './dhs-xls-parser';

/**
 * Builds an in-memory XLS buffer from a 2D array.
 * Each inner array represents one row; values are placed at the exact column
 * indices the DHS export uses (0-based: 1, 3, 6, 10, 12).
 */
function makeDhsXlsBuffer(rows: any[][]): Buffer {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

/** Builds a sparse row array matching the DHS column layout */
function dhsRow(ncrRef: any, surname: string, firstNames: string, rsaId: string, statusCode: string): any[] {
    const row: any[] = new Array(13).fill('');
    row[1] = ncrRef;
    row[3] = surname;
    row[6] = firstNames;
    row[10] = rsaId;
    row[12] = statusCode;
    return row;
}

// ─── Sample data ────────────────────────────────────────────────────────────

const HEADER_ROW = dhsRow('NCR Sys Ref.', 'Surname', 'FirstName(s)', 'RSA ID', 'Status');
const MOKOENA_ROW = dhsRow(615, 'MOKOENA', 'THABO SIPHO', '8305195459081', 'F2');
const DLAMINI_ROW = dhsRow(4285, 'DLAMINI', 'NOMVULA', '9001015800085', 'G');
const LEADING_ZERO_ROW = dhsRow(23662, 'NKOSI', 'LUNGELO', '0205195000081', 'H');
const FOOTER_ROW = dhsRow('Page 1 of 3', '', '', '', '');
const BLANK_ROW = new Array(13).fill('');

// ────────────────────────────────────────────────────────────────────────────

describe('parseDhsXls', () => {
    it('extracts data rows and skips the header row', () => {
        const buf = makeDhsXlsBuffer([HEADER_ROW, MOKOENA_ROW]);
        const result = parseDhsXls(buf);

        expect(result).toHaveLength(1);
        expect(result[0].ncrRef).toBe('615');
        expect(result[0].surname).toBe('MOKOENA');
        expect(result[0].firstNames).toBe('THABO SIPHO');
        expect(result[0].rsaId).toBe('8305195459081');
        expect(result[0].statusCode).toBe('F2');
    });

    it('extracts multiple data rows', () => {
        const buf = makeDhsXlsBuffer([HEADER_ROW, MOKOENA_ROW, DLAMINI_ROW]);
        const result = parseDhsXls(buf);

        expect(result).toHaveLength(2);
        expect(result[1].ncrRef).toBe('4285');
        expect(result[1].surname).toBe('DLAMINI');
        expect(result[1].statusCode).toBe('G');
    });

    it('skips blank rows', () => {
        const buf = makeDhsXlsBuffer([HEADER_ROW, BLANK_ROW, MOKOENA_ROW]);
        const result = parseDhsXls(buf);
        expect(result).toHaveLength(1);
    });

    it('skips footer/page-number rows (non-numeric NCR ref)', () => {
        const buf = makeDhsXlsBuffer([HEADER_ROW, MOKOENA_ROW, FOOTER_ROW]);
        const result = parseDhsXls(buf);
        expect(result).toHaveLength(1);
    });

    it('preserves RSA IDs with leading zeros', () => {
        const buf = makeDhsXlsBuffer([LEADING_ZERO_ROW]);
        const result = parseDhsXls(buf);
        expect(result[0].rsaId).toBe('0205195000081');
    });

    it('strips commas from name fields to prevent CSV corruption', () => {
        const rowWithComma = dhsRow(999, 'VAN, DER MERWE', 'PIETER', '8001015009081', 'A');
        const buf = makeDhsXlsBuffer([rowWithComma]);
        const result = parseDhsXls(buf);
        expect(result[0].surname).not.toContain(',');
    });

    it('handles an empty sheet gracefully', () => {
        const buf = makeDhsXlsBuffer([HEADER_ROW, BLANK_ROW]);
        const result = parseDhsXls(buf);
        expect(result).toHaveLength(0);
    });
});

describe('dhsRowsToCsv', () => {
    it('produces a header row plus one data row', () => {
        const rows = [{ ncrRef: '615', surname: 'MOKOENA', firstNames: 'THABO SIPHO', rsaId: '8305195459081', statusCode: 'F2' }];
        const csv = dhsRowsToCsv(rows);
        const lines = csv.split('\n');
        expect(lines[0]).toBe('NCR_REF,SURNAME,FIRST_NAMES,RSA_ID,STATUS_CODE');
        expect(lines[1]).toBe('615,MOKOENA,THABO SIPHO,8305195459081,F2');
    });

    it('produces only a header row when given an empty array', () => {
        const csv = dhsRowsToCsv([]);
        expect(csv).toBe('NCR_REF,SURNAME,FIRST_NAMES,RSA_ID,STATUS_CODE');
    });

    it('round-trips through parseDhsXls → dhsRowsToCsv correctly', () => {
        const buf = makeDhsXlsBuffer([HEADER_ROW, MOKOENA_ROW, DLAMINI_ROW]);
        const rows = parseDhsXls(buf);
        const csv = dhsRowsToCsv(rows);
        const lines = csv.split('\n');

        expect(lines).toHaveLength(3); // header + 2 data rows
        expect(lines[1]).toContain('615');
        expect(lines[2]).toContain('4285');
    });
});
