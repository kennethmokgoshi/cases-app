import { describe, it, expect } from 'vitest';
import * as xlsx from 'xlsx';
import { parsePartnerReport } from './partner-invoice';

function createMockExcelBuffer(data: any[][]): Buffer {
  const ws = xlsx.utils.aoa_to_sheet(data);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('parsePartnerReport', () => {
  it('should parse a valid partner report and calculate the 50% split correctly', () => {
    const data = [
      ['Date', 'ID Number', 'Client Name', 'Payment Method', 'Amount'],
      ['2026-05-01', '1234567890123', 'John Doe', 'Debicheck', 1000],
      ['2026-05-02', '9876543210987', 'Jane Smith', 'TT3', 500],
      ['2026-05-03', '4561237890123', 'Alice Brown', 'Debicheck', 2000],
      ['2026-05-04', '7894561230123', 'Bob White', 'Bank Transfer', 1500],
      ['2026-05-04', '7894561230123', 'Empty Amount', 'Bank Transfer', ''],
    ];

    const buffer = createMockExcelBuffer(data);
    const result = parsePartnerReport(buffer, 50);

    expect(result.errors).toHaveLength(0);
    expect(result.validRows).toBe(4);
    expect(result.invalidRows).toBe(0); // empty string parsed as NaN but ignored since it's empty, actually let's see. empty amount is not counted as invalid if trim() === ''
    expect(result.totalCollected).toBe(5000);
    expect(result.totalInvoiceAmount).toBe(2500);

    // Grouping checks
    expect(result.groupedLines).toHaveLength(3);
    
    // Sort by amount descending
    expect(result.groupedLines[0].paymentMethod).toBe('Debicheck');
    expect(result.groupedLines[0].totalCollected).toBe(3000);
    expect(result.groupedLines[0].invoiceAmount).toBe(1500);

    expect(result.groupedLines[1].paymentMethod).toBe('Bank Transfer');
    expect(result.groupedLines[1].totalCollected).toBe(1500);
    expect(result.groupedLines[1].invoiceAmount).toBe(750);

    expect(result.groupedLines[2].paymentMethod).toBe('TT3');
    expect(result.groupedLines[2].totalCollected).toBe(500);
    expect(result.groupedLines[2].invoiceAmount).toBe(250);
  });

  it('should detect invalid rows with bad amounts', () => {
    const data = [
      ['Payment Method', 'Amount'],
      ['Debicheck', 'invalid_amount'],
      ['TT1', 100],
    ];

    const buffer = createMockExcelBuffer(data);
    const result = parsePartnerReport(buffer, 50);

    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(1);
    expect(result.totalCollected).toBe(100);
  });

  it('should handle missing columns', () => {
    const data = [
      ['Date', 'ID Number', 'Client Name'],
      ['2026-05-01', '1234567890123', 'John Doe'],
    ];

    const buffer = createMockExcelBuffer(data);
    const result = parsePartnerReport(buffer, 50);

    expect(result.errors).toContain('Could not find header row containing "Amount".');
    expect(result.validRows).toBe(0);
  });
});
