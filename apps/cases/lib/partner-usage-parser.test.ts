import { describe, it, expect } from 'vitest';
import * as xlsx from 'xlsx';
import { parsePartnerUsageReport } from './partner-usage-parser';

/**
 * Helper: build an ArrayBuffer from an array of row objects (simulating an XLS upload).
 */
function buildExcelBuffer(rows: Record<string, unknown>[], sheetName = 'Sheet1'): ArrayBuffer {
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.json_to_sheet(rows);
    xlsx.utils.book_append_sheet(workbook, sheet, sheetName);
    const buf = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    // Convert Node Buffer to ArrayBuffer
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('parsePartnerUsageReport', () => {
    it('parses rows with Description/Quantity/UnitPrice headers', () => {
        const buffer = buildExcelBuffer([
            { Description: 'Lead Pack A', Quantity: 10, UnitPrice: 100 },
            { Description: 'Lead Pack B', Quantity: 5, UnitPrice: 200 },
        ]);

        const result = parsePartnerUsageReport(buffer);

        expect(result.lineItems).toHaveLength(2);
        expect(result.lineItems[0].description).toBe('Lead Pack A');
        expect(result.lineItems[0].quantity).toBe(10);
        expect(result.lineItems[0].unitPrice).toBe(100);
        expect(result.lineItems[1].description).toBe('Lead Pack B');
        expect(result.subtotal).toBe(10 * 100 + 5 * 200); // 2000
    });

    it('fuzzy-matches variant header names (Item, Qty, Rate)', () => {
        const buffer = buildExcelBuffer([
            { Item: 'Debt Review Referral', Qty: 3, Rate: 150 },
        ]);

        const result = parsePartnerUsageReport(buffer);

        expect(result.lineItems).toHaveLength(1);
        expect(result.lineItems[0].description).toBe('Debt Review Referral');
        expect(result.lineItems[0].quantity).toBe(3);
        expect(result.lineItems[0].unitPrice).toBe(150);
        expect(result.subtotal).toBe(450);
    });

    it('fuzzy-matches "Amount" as price column', () => {
        const buffer = buildExcelBuffer([
            { Description: 'Insurance Lead', Quantity: 2, Amount: 75 },
        ]);

        const result = parsePartnerUsageReport(buffer);

        expect(result.lineItems).toHaveLength(1);
        expect(result.lineItems[0].unitPrice).toBe(75);
        expect(result.subtotal).toBe(150);
    });

    it('falls back to flat-rate when headers are unrecognisable', () => {
        const buffer = buildExcelBuffer([
            { Name: 'John', Surname: 'Doe', Phone: '0821234567' },
            { Name: 'Jane', Surname: 'Smith', Phone: '0829876543' },
            { Name: 'Bob', Surname: 'Brown', Phone: '0831112222' },
        ]);

        const result = parsePartnerUsageReport(buffer);

        expect(result.lineItems).toHaveLength(1);
        expect(result.lineItems[0].description).toBe('B2B Leads Generated (Flat Rate)');
        expect(result.lineItems[0].quantity).toBe(3);
        expect(result.lineItems[0].unitPrice).toBe(50);
        expect(result.subtotal).toBe(150);
    });

    it('throws on empty spreadsheet (no rows)', () => {
        const buffer = buildExcelBuffer([]);

        expect(() => parsePartnerUsageReport(buffer)).toThrow(
            'Excel file contains no valid data rows.'
        );
    });

    it('handles mixed valid and invalid rows gracefully', () => {
        const buffer = buildExcelBuffer([
            { Description: 'Valid Item', Quantity: 1, UnitPrice: 500 },
            { RandomCol: 'junk' }, // no desc/qty/price
            { Description: 'Another Item', Quantity: 2, UnitPrice: 250 },
        ]);

        const result = parsePartnerUsageReport(buffer);

        // The junk row should be skipped, only 2 valid items
        expect(result.lineItems).toHaveLength(2);
        expect(result.subtotal).toBe(500 + 500); // 1*500 + 2*250
    });

    it('defaults quantity to 1 when value is non-numeric', () => {
        const buffer = buildExcelBuffer([
            { Description: 'Broken Qty', Quantity: 'abc', UnitPrice: 100 },
        ]);

        const result = parsePartnerUsageReport(buffer);

        expect(result.lineItems[0].quantity).toBe(1);
        expect(result.subtotal).toBe(100);
    });
});
