import * as xlsx from 'xlsx';
import { z } from 'zod';

export type PaymentRow = {
  paymentMethod: string;
  amount: number;
  reference?: string;
};

export type GroupedInvoiceLineItem = {
  paymentMethod: string;
  totalCollected: number;
  splitPercentage: number;
  invoiceAmount: number;
};

export type PreviewResult = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  totalCollected: number;
  totalInvoiceAmount: number;
  groupedLines: GroupedInvoiceLineItem[];
  errors: string[];
};

export function parsePartnerReport(fileBuffer: Buffer, splitPercent: number): PreviewResult {
  const errors: string[] = [];
  
  let workbook;
  try {
    workbook = xlsx.read(fileBuffer, { type: 'buffer' });
  } catch (err) {
    return {
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      totalCollected: 0,
      totalInvoiceAmount: 0,
      groupedLines: [],
      errors: ['Failed to read Excel file.'],
    };
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Use header: 1 to get array of arrays
  const rawRows: any[][] = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
  
  if (rawRows.length === 0) {
    return {
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      totalCollected: 0,
      totalInvoiceAmount: 0,
      groupedLines: [],
      errors: ['File is empty.'],
    };
  }

  // Find header row index
  let headerIndex = 0;
  let headers: string[] = [];
  
  for (let i = 0; i < Math.min(10, rawRows.length); i++) {
    const row = rawRows[i];
    if (Array.isArray(row) && row.some(cell => typeof cell === 'string' && cell.toLowerCase().includes('amount'))) {
      headerIndex = i;
      headers = row.map(h => (typeof h === 'string' ? h.toLowerCase().trim() : ''));
      break;
    }
  }

  if (headers.length === 0) {
    return {
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      totalCollected: 0,
      totalInvoiceAmount: 0,
      groupedLines: [],
      errors: ['Could not find header row containing "Amount".'],
    };
  }

  const amountCol = headers.findIndex(h => h.includes('amount'));
  const methodCol = headers.findIndex(h => h.includes('method') || h.includes('type') || h.includes('payment'));
  
  if (amountCol === -1 || methodCol === -1) {
    return {
      totalRows: rawRows.length - 1,
      validRows: 0,
      invalidRows: 0,
      totalCollected: 0,
      totalInvoiceAmount: 0,
      groupedLines: [],
      errors: ['Required columns missing: Need "Amount" and "Payment Method" or similar.'],
    };
  }

  const groupedMap = new Map<string, number>();
  let validRows = 0;
  let invalidRows = 0;
  let totalCollected = 0;

  for (let i = headerIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.length === 0) continue;

    const rawAmount = row[amountCol];
    const rawMethod = row[methodCol];

    // Attempt to parse amount
    const amount = typeof rawAmount === 'number' ? rawAmount : parseFloat(String(rawAmount).replace(/[^0-9.-]+/g, ''));
    
    if (isNaN(amount)) {
      if (rawAmount !== undefined && rawAmount !== null && String(rawAmount).trim() !== '') {
         invalidRows++;
      }
      continue;
    }

    const method = typeof rawMethod === 'string' ? rawMethod.trim() : (rawMethod ? String(rawMethod) : 'Unknown');
    const normalizedMethod = method === '' ? 'Unknown' : method;

    validRows++;
    totalCollected += amount;

    groupedMap.set(normalizedMethod, (groupedMap.get(normalizedMethod) || 0) + amount);
  }

  const groupedLines: GroupedInvoiceLineItem[] = [];
  let totalInvoiceAmount = 0;

  for (const [method, amount] of Array.from(groupedMap.entries())) {
    const invoiceAmount = amount * (splitPercent / 100);
    groupedLines.push({
      paymentMethod: method,
      totalCollected: amount,
      splitPercentage: splitPercent,
      invoiceAmount,
    });
    totalInvoiceAmount += invoiceAmount;
  }

  return {
    totalRows: rawRows.length - headerIndex - 1,
    validRows,
    invalidRows,
    totalCollected,
    totalInvoiceAmount,
    groupedLines: groupedLines.sort((a, b) => b.totalCollected - a.totalCollected),
    errors,
  };
}
