import * as XLSX from 'xlsx';

export interface DhsRawRow {
    ncrRef: string;
    surname: string;
    firstNames: string;
    rsaId: string;
    statusCode: string;
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
