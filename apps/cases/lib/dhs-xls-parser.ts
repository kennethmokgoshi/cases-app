import * as XLSX from 'xlsx';

export interface DhsRawRow {
    ncrRef: string;
    surname: string;
    firstNames: string;
    rsaId: string;
    statusCode: string;
}

/**
 * A fully structured DHS record — the same shape the AI extraction returns,
 * so the import route can use either path interchangeably.
 */
export interface DhsExtractedRecord {
    ncr_ref: string;
    surname: string;
    first_name: string;
    additional_names: string;
    rsa_id: string;
    status_code: string;
    status_label: string;
    action: 'create' | 'update';
    flag: string | null;
}

/** DHS case status code → human-readable label (mirrors PROMPTS.DHS_SUMMARY_REPORT). */
const STATUS_LABELS: Record<string, string> = {
    F1: 'Awaiting Proposal Acceptance',
    F2: 'Under Debt Review (Active)',
    G: 'Court Order Granted',
    G1: 'Conditional Court Order',
    H: 'Clearance Certificate Issued',
    B: 'Rejected / Withdrawn',
    C: 'Transferred to Another DC',
    D3: 'Debt Review Removed (Paid Up)',
    D4: 'Debt Review Removed (Other)',
    A: 'Application Received',
    A1: 'Awaiting Credit Provider Response',
};

/**
 * Converts deterministically-parsed rows into the structured record shape
 * WITHOUT calling the AI. Applies the same rules the DHS_SUMMARY_REPORT prompt
 * describes: split first/additional names, map status labels, and flag missing,
 * malformed, or duplicate RSA IDs.
 *
 * This keeps consumer PII in-house and avoids an OpenAI dependency for the XLS
 * path, where every field is already available from the sheet.
 */
export function dhsRowsToRecords(rows: DhsRawRow[]): DhsExtractedRecord[] {
    // Count RSA IDs so duplicates can be flagged
    const idCounts = new Map<string, number>();
    for (const r of rows) {
        const id = r.rsaId.trim();
        if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    }

    return rows.map((r) => {
        const nameParts = r.firstNames.trim().split(/\s+/).filter(Boolean);
        const rsaId = r.rsaId.trim();

        let flag: string | null = null;
        if (!rsaId) flag = 'Missing RSA ID';
        else if (!/^\d{13}$/.test(rsaId)) flag = 'Malformed RSA ID';
        else if ((idCounts.get(rsaId) ?? 0) > 1) flag = 'Duplicate ID - verify';

        return {
            ncr_ref: r.ncrRef,
            surname: r.surname,
            first_name: nameParts[0] ?? '',
            additional_names: nameParts.slice(1).join(' '),
            rsa_id: rsaId,
            status_code: r.statusCode,
            status_label: STATUS_LABELS[r.statusCode] ?? r.statusCode,
            // The DB-comparison step refines this; default to 'create' until matched.
            action: 'create',
            flag,
        };
    });
}

/**
 * Parses a DHS Debt Counsellor Summary Report XLS/XLSX buffer.
 * Extracts rows from the fixed column positions used by the NCR DHS export.
 *
 * Column mapping:
 *   index 1  → NCR System Reference Number
 *   index 3  → Surname
 *   index 6  → First Name(s)
 *   index 10 → RSA ID Number
 *   index 12 → Case Status Code
 */
export function parseDhsXls(buffer: Buffer): DhsRawRow[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

    const records: DhsRawRow[] = [];
    for (const row of rows) {
        const ncrRef = row[1];
        // Skip header rows, blank rows, and footer rows (NCR ref must be a number)
        if (!ncrRef || isNaN(Number(ncrRef))) continue;
        records.push({
            ncrRef: String(ncrRef),
            surname: String(row[3] ?? '').replace(/,/g, ' ').trim(),
            firstNames: String(row[6] ?? '').replace(/,/g, ' ').trim(),
            rsaId: String(row[10] ?? '').trim(),
            statusCode: String(row[12] ?? '').trim(),
        });
    }
    return records;
}

/**
 * Converts parsed DHS rows into a CSV string for sending to the AI prompt.
 */
export function dhsRowsToCsv(rows: DhsRawRow[]): string {
    const lines = ['NCR_REF,SURNAME,FIRST_NAMES,RSA_ID,STATUS_CODE'];
    for (const row of rows) {
        lines.push(`${row.ncrRef},${row.surname},${row.firstNames},${row.rsaId},${row.statusCode}`);
    }
    return lines.join('\n');
}

/**
 * Dumps the entire XLS sheet as tab-separated text so the AI can identify
 * column positions by header labels, regardless of the export format.
 * Used as a fallback when fixed-column parsing yields no rows.
 */
export function dumpXlsAsText(buffer: Buffer, maxRows = 500): string {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });

    return rows
        .slice(0, maxRows)
        .map((row) => (row as any[]).map((cell) => String(cell ?? '').replace(/\t/g, ' ')).join('\t'))
        .join('\n');
}
