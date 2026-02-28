import * as XLSX from 'xlsx';
import { validateSAID } from './openai';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type SkippedRow = {
    rowNumber: number;   // 1-based row number in the original file
    name: string | null; // Surname / description from the file
    amount: number;
    reason: string;
};

export type ParsedPayment = {
    fileNr: string | null;    // Zenowethu case file number (primary match key)
    idNumber: string | null;  // SA 13-digit ID (secondary match key)
    name: string | null;      // Surname and Initials — stored in notes
    amount: number;
    date: Date;
    method: string;           // 'DEBIT_ORDER' | 'EFT'
    reference: string | null; // Letsatsi Loan nr
};

export type ParseResult = {
    payments: ParsedPayment[];
    skipped: SkippedRow[];
    format: 'letsatsi' | 'generic';
};

// ─────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────

export function parsePaymentBatch(buffer: ArrayBuffer): ParseResult {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    // Get raw rows as arrays (header: 1) so we can handle multi-level headers
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        raw: false, // convert dates to strings, we'll parse manually
    });

    const format = detectFormat(rows);

    if (format === 'letsatsi') {
        const { payments, skipped } = parseLetsatsi(rows);
        return { payments, skipped, format };
    }

    const { payments, skipped } = parseGeneric(rows);
    return { payments, skipped, format };
}

// ─────────────────────────────────────────────
// Format detection
// ─────────────────────────────────────────────

function detectFormat(rows: any[][]): 'letsatsi' | 'generic' {
    // Letsatsi files have "File nr", "ID number", and "Surname and Initials" as column headers
    for (let i = 0; i < Math.min(6, rows.length); i++) {
        const rowStr = rows[i].map((c: any) => String(c).trim());
        const hasFileNr = rowStr.some(c => c === 'File nr');
        const hasIdNumber = rowStr.some(c => c === 'ID number');
        const hasSurname = rowStr.some(c => c.startsWith('Surname'));
        if (hasFileNr && hasIdNumber && hasSurname) return 'letsatsi';
    }
    return 'generic';
}

// ─────────────────────────────────────────────
// Letsatsi parser
// ─────────────────────────────────────────────

function parseLetsatsi(rows: any[][]): { payments: ParsedPayment[]; skipped: SkippedRow[] } {
    const payments: ParsedPayment[] = [];
    const skipped: SkippedRow[] = [];

    // ── Find the column-header row ──────────────────────────────────────────
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(6, rows.length); i++) {
        if (rows[i].some((c: any) => String(c).trim() === 'File nr')) {
            headerRowIndex = i;
            break;
        }
    }

    if (headerRowIndex === -1) {
        skipped.push({ rowNumber: 0, name: null, amount: 0, reason: 'Could not find Letsatsi column headers (missing "File nr" row)' });
        return { payments, skipped };
    }

    // ── Map column indices by header name ───────────────────────────────────
    const headers = rows[headerRowIndex].map((h: any) => String(h).trim());
    const col = (name: string) => headers.indexOf(name);

    const fileNrIdx       = col('File nr');
    const idNumberIdx     = col('ID number');
    const surnameIdx      = col('Surname and Initials');
    const loanNrIdx       = col('Loan nr');
    const dateIdx         = col('Date');
    const totalIdx        = col('Total');

    // "Total" must exist — if not, try last column as fallback
    const amountIdx = totalIdx >= 0 ? totalIdx : headers.length - 1;

    // ── Iterate data rows ───────────────────────────────────────────────────
    let currentMethod = 'EFT'; // updated when we hit a Sub type row

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        const rowNumber = i + 1; // 1-based for user display

        // Completely empty row → silent skip
        if (row.every((c: any) => c === '' || c === null || c === undefined)) continue;

        // Flatten row to a single string for group/sub-type detection
        const rowFlat = row.map((c: any) => String(c ?? '')).join(' ').toLowerCase();

        // Group type / Sub type header → update method and skip
        if (rowFlat.includes('group type') || rowFlat.includes('sub type')) {
            if (rowFlat.includes('debecheck')) currentMethod = 'DEBIT_ORDER';
            else if (rowFlat.includes('bank transfer')) currentMethod = 'EFT';
            continue; // not a data row
        }

        // ── Extract fields ──────────────────────────────────────────────────
        const rawFileNr  = fileNrIdx >= 0 ? String(row[fileNrIdx] ?? '').trim() : '';
        const rawId      = idNumberIdx >= 0 ? String(row[idNumberIdx] ?? '').replace(/\D/g, '').trim() : '';
        const name       = surnameIdx >= 0 ? String(row[surnameIdx] ?? '').trim() || null : null;
        const loanNr     = loanNrIdx >= 0 ? String(row[loanNrIdx] ?? '').trim() || null : null;
        const rawAmount  = row[amountIdx] ?? 0;
        const rawDate    = dateIdx >= 0 ? row[dateIdx] : null;

        // Parse amount — strip currency symbols / commas
        const amount = parseFloat(String(rawAmount).replace(/[^0-9.]/g, '')) || 0;

        // Parse date
        let date = new Date();
        if (rawDate) {
            const parsed = new Date(rawDate);
            if (!isNaN(parsed.getTime())) date = parsed;
        }

        // ── Row is a data row only if File nr is numeric ────────────────────
        const fileNrNum = parseInt(rawFileNr, 10);
        const isDataRow = !isNaN(fileNrNum) && fileNrNum > 0;

        // Rows without a numeric File nr that aren't group headers are
        // likely subtotal / summary rows — skip silently
        if (!isDataRow) continue;

        const fileNr = rawFileNr || null;

        // ── Validation ──────────────────────────────────────────────────────
        if (amount <= 0) {
            skipped.push({ rowNumber, name, amount, reason: 'Amount is zero or missing' });
            continue;
        }

        // We need either a valid File nr (already confirmed above) or a valid SA ID
        // File nr is confirmed — we'll attempt a DB match by it regardless of ID validity
        // But also validate the ID for use as secondary match key
        const idValidation = rawId ? validateSAID(rawId) : { isValid: false, error: 'No ID number in row' };
        const validId = idValidation.isValid ? rawId : null;

        // If no file nr AND no valid ID → skip + report
        if (!fileNr && !validId) {
            const reason = rawId
                ? `ID number "${rawId}" is not a valid SA ID — ${idValidation.error}`
                : 'No File nr and no ID number found in row';
            skipped.push({ rowNumber, name, amount, reason });
            continue;
        }

        payments.push({
            fileNr,
            idNumber: validId,
            name,
            amount,
            date,
            method: currentMethod,
            reference: loanNr });
    }

    return { payments, skipped };
}

// ─────────────────────────────────────────────
// Generic parser (existing format with column names like "ID Number", "Amount", etc.)
// ─────────────────────────────────────────────

function parseGeneric(rows: any[][]): { payments: ParsedPayment[]; skipped: SkippedRow[] } {
    const payments: ParsedPayment[] = [];
    const skipped: SkippedRow[] = [];

    if (rows.length === 0) return { payments, skipped };

    // Use first row as headers
    const headers = rows[0].map((h: any) => String(h ?? '').trim());
    const col = (name: string) => headers.findIndex(
        h => h.toLowerCase() === name.toLowerCase()
    );

    // Try multiple aliases for each column
    const idIdx  = Math.max(col('ID Number'), col('id_number'), col('IDNumber'), col('ID'));
    const amtIdx = Math.max(col('Amount'), col('amount'), col('AMOUNT'));
    const dtIdx  = Math.max(col('Date'), col('date'), col('Payment Date'));
    const mthIdx = Math.max(col('Method'), col('method'));
    const refIdx = Math.max(col('Reference'), col('reference'), col('Ref'));

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const rowNumber = i + 1;

        if (row.every((c: any) => c === '' || c === null || c === undefined)) continue;

        const rawId     = idIdx >= 0 ? String(row[idIdx] ?? '').replace(/\D/g, '').trim() : '';
        const rawAmount = amtIdx >= 0 ? row[amtIdx] : 0;
        const amount    = parseFloat(String(rawAmount ?? 0).replace(/[^0-9.]/g, '')) || 0;
        const rawDate   = dtIdx >= 0 ? row[dtIdx] : null;
        const method    = mthIdx >= 0 ? String(row[mthIdx] ?? 'EFT').trim() : 'EFT';
        const reference = refIdx >= 0 ? String(row[refIdx] ?? '').trim() || null : null;

        let date = new Date();
        if (rawDate) {
            const parsed = rawDate instanceof Date ? rawDate : new Date(rawDate);
            if (!isNaN(parsed.getTime())) date = parsed;
        }

        if (amount <= 0) {
            skipped.push({ rowNumber, name: null, amount, reason: 'Amount is zero or missing' });
            continue;
        }

        if (!rawId) {
            skipped.push({ rowNumber, name: null, amount, reason: 'No ID number in row' });
            continue;
        }

        const validation = validateSAID(rawId);
        if (!validation.isValid) {
            skipped.push({
                rowNumber,
                name: null,
                amount,
                reason: `ID number "${rawId}" is not a valid SA ID — ${validation.error}` });
            continue;
        }

        payments.push({
            fileNr: null,
            idNumber: rawId,
            name: null,
            amount,
            date,
            method,
            reference });
    }

    return { payments, skipped };
}
