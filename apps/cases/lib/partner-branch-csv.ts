/**
 * CSV parsing for the partner branch contact directory.
 *
 * Branch contact lists arrive from partners as spreadsheets. Staff paste or
 * upload them here rather than editing 60+ branches by hand. The parser is
 * deliberately forgiving about column order, header casing and spacing, and
 * strict about what it will silently accept as a contact detail — a malformed
 * email is reported as a row error, never written.
 */

/** Canonical branch fields a CSV may set. */
export const BRANCH_CSV_FIELDS = [
    'name',
    'code',
    'contactPerson',
    'email',
    'phone',
    'alternatePhone',
    'whatsappNumber',
    'addressLine',
    'city',
    'province',
    'postalCode',
    'notes',
] as const;

export type BranchCsvField = (typeof BRANCH_CSV_FIELDS)[number];

/**
 * Header aliases, normalised to lowercase alphanumerics. Partner spreadsheets
 * use their own wording ("Branch", "Tel", "Contact Person"), so map the common
 * variants rather than forcing staff to rename columns first.
 */
const HEADER_ALIASES: Record<string, BranchCsvField> = {
    name: 'name',
    branch: 'name',
    branchname: 'name',
    office: 'name',
    code: 'code',
    branchcode: 'code',
    contactperson: 'contactPerson',
    contact: 'contactPerson',
    manager: 'contactPerson',
    branchmanager: 'contactPerson',
    email: 'email',
    emailaddress: 'email',
    branchemail: 'email',
    phone: 'phone',
    tel: 'phone',
    telephone: 'phone',
    cell: 'phone',
    cellnumber: 'phone',
    contactnumber: 'phone',
    phonenumber: 'phone',
    alternatephone: 'alternatePhone',
    altphone: 'alternatePhone',
    alternativephone: 'alternatePhone',
    secondphone: 'alternatePhone',
    whatsapp: 'whatsappNumber',
    whatsappnumber: 'whatsappNumber',
    address: 'addressLine',
    addressline: 'addressLine',
    streetaddress: 'addressLine',
    physicaladdress: 'addressLine',
    city: 'city',
    town: 'city',
    province: 'province',
    postalcode: 'postalCode',
    postcode: 'postalCode',
    zip: 'postalCode',
    notes: 'notes',
    comment: 'notes',
    comments: 'notes' };

function normaliseHeader(header: string): string {
    return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Split CSV text into rows of cells, honouring quoted fields (which may contain
 * commas and newlines) and doubled quotes as an escaped quote.
 */
export function parseCsvRows(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let inQuotes = false;

    // Normalise line endings so \r\n and \r behave like \n.
    const input = text.replace(/\r\n?/g, '\n');

    for (let i = 0; i < input.length; i++) {
        const char = input[i];

        if (inQuotes) {
            if (char === '"') {
                if (input[i + 1] === '"') {
                    cell += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                cell += char;
            }
            continue;
        }

        if (char === '"') {
            inQuotes = true;
        } else if (char === ',') {
            row.push(cell);
            cell = '';
        } else if (char === '\n') {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        } else {
            cell += char;
        }
    }

    // Trailing cell/row (no newline at end of file).
    if (cell.length > 0 || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }

    // Drop rows that are entirely blank — trailing newlines are common.
    return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

export interface ParsedBranchRow {
    /** 1-based line number in the source CSV, for error reporting. */
    line: number;
    values: Partial<Record<BranchCsvField, string>>;
    errors: string[];
}

export interface ParsedBranchCsv {
    rows: ParsedBranchRow[];
    /** Headers that were not recognised — reported so staff can fix the file. */
    unknownHeaders: string[];
    /** Fatal problems that stop the whole import. */
    errors: string[];
}

// Deliberately permissive: catches "not an email at all" without rejecting the
// unusual-but-valid addresses a stricter pattern would.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A phone number is usable if it holds at least 9 digits (SA numbers are 10). */
function looksLikePhone(value: string): boolean {
    return (value.match(/\d/g) ?? []).length >= 9;
}

export function parseBranchCsv(text: string): ParsedBranchCsv {
    const result: ParsedBranchCsv = { rows: [], unknownHeaders: [], errors: [] };

    const rawRows = parseCsvRows(text ?? '');
    if (rawRows.length === 0) {
        result.errors.push('The file is empty.');
        return result;
    }

    const headerRow = rawRows[0];
    const columns: (BranchCsvField | null)[] = headerRow.map((header) => {
        const key = normaliseHeader(header);
        const field = HEADER_ALIASES[key];
        if (!field && header.trim()) result.unknownHeaders.push(header.trim());
        return field ?? null;
    });

    if (!columns.includes('name')) {
        result.errors.push('No "Branch" or "Name" column found — that column is required.');
        return result;
    }

    for (let r = 1; r < rawRows.length; r++) {
        const cells = rawRows[r];
        const parsed: ParsedBranchRow = { line: r + 1, values: {}, errors: [] };

        columns.forEach((field, index) => {
            if (!field) return;
            const value = (cells[index] ?? '').trim();
            if (value) parsed.values[field] = value;
        });

        if (!parsed.values.name) {
            parsed.errors.push('Branch name is missing.');
        }
        if (parsed.values.email && !EMAIL_PATTERN.test(parsed.values.email)) {
            parsed.errors.push(`"${parsed.values.email}" is not a valid email address.`);
        }
        for (const phoneField of ['phone', 'alternatePhone', 'whatsappNumber'] as const) {
            const value = parsed.values[phoneField];
            if (value && !looksLikePhone(value)) {
                parsed.errors.push(`"${value}" does not look like a phone number.`);
            }
        }

        result.rows.push(parsed);
    }

    if (result.rows.length === 0) {
        result.errors.push('The file has a header row but no data rows.');
    }

    return result;
}

/** A CSV template staff can download, fill in and paste back. */
export function branchCsvTemplate(branchNames: string[] = []): string {
    const header = 'Branch,Code,Contact Person,Email,Phone,Alternate Phone,WhatsApp,Address,City,Province,Postal Code,Notes';
    const quote = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
    const body = branchNames.map((name) => `${quote(name)},,,,,,,,,,,`);
    return [header, ...body].join('\n');
}
