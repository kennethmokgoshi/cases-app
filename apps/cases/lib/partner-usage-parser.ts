import * as xlsx from 'xlsx';
import { InvoiceLineItem } from '@/lib/invoice-pdf';

export interface ParsedInvoiceData {
    lineItems: InvoiceLineItem[];
    subtotal: number;
}

/**
 * Parse an Excel buffer (XLS/XLSX) into invoice line items.
 *
 * The parser fuzzy-matches column headers so partner reports with slightly
 * different naming conventions still work:
 *   Description / Item  →  line item description
 *   Qty / Quantity      →  quantity
 *   Price / Rate / Amount → unit price
 *
 * If no matching headers are found but rows exist, it falls back to a
 * flat-rate model (1 lead per row at R50 each).
 */
export function parsePartnerUsageReport(buffer: ArrayBuffer): ParsedInvoiceData {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
        throw new Error('Excel file contains no sheets.');
    }

    const sheet = workbook.Sheets[sheetName];
    const rows: Record<string, unknown>[] = xlsx.utils.sheet_to_json(sheet);

    const lineItems: InvoiceLineItem[] = [];
    let subtotal = 0;

    for (const row of rows) {
        const keys = Object.keys(row);
        const descKey = keys.find(
            k => k.toLowerCase().includes('desc') || k.toLowerCase().includes('item')
        );
        const qtyKey = keys.find(
            k => k.toLowerCase().includes('qty') || k.toLowerCase().includes('quant')
        );
        const priceKey = keys.find(
            k =>
                k.toLowerCase().includes('price') ||
                k.toLowerCase().includes('rate') ||
                k.toLowerCase().includes('amount')
        );

        if (descKey && qtyKey && priceKey) {
            const quantity = Number(row[qtyKey]) || 1;
            const unitPrice = Number(row[priceKey]) || 0;
            lineItems.push({
                description: String(row[descKey]),
                quantity,
                unitPrice
            });
            subtotal += quantity * unitPrice;
        }
    }

    // Fallback: flat-rate per row if no structured headers found
    if (lineItems.length === 0) {
        if (rows.length > 0) {
            lineItems.push({
                description: 'B2B Leads Generated (Flat Rate)',
                quantity: rows.length,
                unitPrice: 50
            });
            subtotal = rows.length * 50;
        } else {
            throw new Error('Excel file contains no valid data rows.');
        }
    }

    return { lineItems, subtotal };
}
