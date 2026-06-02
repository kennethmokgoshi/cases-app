import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage, RGB } from 'pdf-lib';

// ---------------------------------------------------------------------------
// Zenowethu letterhead constants
// ---------------------------------------------------------------------------

const FIRM = {
    name:    'Zenowethu Debt Management (PTY) LTD',
    ncrdc:   'NCRDC3693',
    dcasa:   '0863',
    regNo:   '2013/121120/07',
    address: 'Suite 2, Second Floor, Central House, 17 Central Road, Mabopane, 0190',
    tel:     '012 035 1824',
    cell:    '082 363 8207',
    email:   'info@zenowethu.co.za',
    web:     'www.zenowethu.co.za',
    dc:      'Aaron Nzotho',
};

// ---------------------------------------------------------------------------
// Colours — Zenowethu brand
// ---------------------------------------------------------------------------

const NAVY:   RGB = rgb(0.043, 0.114, 0.208);  // #0B1D35
const AMBER:  RGB = rgb(0.769, 0.584, 0.227);  // #C4953A
const DARK:   RGB = rgb(0.1,   0.1,   0.1);
const MID:    RGB = rgb(0.4,   0.4,   0.4);
const LIGHT:  RGB = rgb(0.92,  0.92,  0.92);
const WHITE:  RGB = rgb(1,     1,     1);
const RED:    RGB = rgb(0.7,   0.1,   0.1);

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const MARGIN        = 55;
const PAGE_WIDTH    = 595;
const PAGE_HEIGHT   = 842;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CourtDocAccount {
    creditorName:      string;
    accountNumber?:    string;
    accountType:       string;
    outstandingBalance: number;
    monthlyInstalment?: number;
    status:            string;        // ACTIVE | CLOSED | etc.
    isPrescribed:      boolean;
    hasPaidUpLetter:   boolean;
    paidUpDate?:       string;
    letterReference?:  string;
}

export interface CourtDocInput {
    // Case
    fileNumber:            string;
    courtCaseNumber?:      string;
    courtName?:            string;
    // Primary client
    clientFullName:        string;
    clientIdNumber:        string;
    clientAddress?:        string;
    clientPhone?:          string;
    clientEmail?:          string;
    // Joint client (spouse / co-applicant) — only included if provided
    jointClientFullName?:  string;
    jointClientIdNumber?:  string;
    // Credit accounts — only included if length > 0
    creditAccounts?:       CourtDocAccount[];
    // Who generated
    generatedBy?:          string;
}

export type CourtDocType =
    | 'NOTICE_OF_MOTION'
    | 'FOUNDING_AFFIDAVIT'
    | 'NOTICE_OF_SET_DOWN'
    | 'NOTICE_OF_MOTION_RESCISSION'
    | 'COURT_ORDER_GRANTED'
    | 'PROOF_OF_SERVICE';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function zarFmt(n: number): string {
    return new Intl.NumberFormat('en-ZA', {
        style: 'currency', currency: 'ZAR', minimumFractionDigits: 2,
    }).format(n);
}

function fmtDate(iso?: string | null): string {
    if (!iso) return '________________';
    try { return new Date(iso).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' }); }
    catch { return iso; }
}

function today(): string {
    return new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
}

function newRef(prefix: string): string {
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `ZDM-${prefix}-${stamp}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
        const candidate = cur ? `${cur} ${w}` : w;
        if (font.widthOfTextAtSize(candidate, size) > maxW && cur) {
            lines.push(cur);
            cur = w;
        } else {
            cur = candidate;
        }
    }
    if (cur) lines.push(cur);
    return lines;
}

interface BlockOpts { font?: PDFFont; size?: number; color?: RGB; spacing?: number; indent?: number; }

function textBlock(
    page: PDFPage, text: string, x: number, y: number, maxW: number,
    bold: PDFFont, reg: PDFFont, opts: BlockOpts = {},
): number {
    const font    = opts.font    ?? reg;
    const size    = opts.size    ?? 9.5;
    const color   = opts.color   ?? DARK;
    const spacing = opts.spacing ?? 14;
    const indent  = opts.indent  ?? 0;
    for (const line of wrap(text, font, size, maxW - indent)) {
        page.drawText(line, { x: x + indent, y, size, font, color });
        y -= spacing;
    }
    return y;
}

// ---------------------------------------------------------------------------
// Page scaffolding helpers
// ---------------------------------------------------------------------------

function addPage(doc: PDFDocument): PDFPage {
    return doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
}

function drawLetterhead(page: PDFPage, bold: PDFFont, reg: PDFFont): number {
    // Navy header bar
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 72, width: PAGE_WIDTH, height: 72, color: NAVY });
    // Amber accent strip
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 75, width: PAGE_WIDTH, height: 3, color: AMBER });

    page.drawText(FIRM.name, { x: MARGIN, y: PAGE_HEIGHT - 30, size: 12.5, font: bold, color: WHITE });
    page.drawText(`NCR Reg: ${FIRM.ncrdc}  |  DCASA: ${FIRM.dcasa}  |  Co. Reg: ${FIRM.regNo}`, {
        x: MARGIN, y: PAGE_HEIGHT - 46, size: 7.5, font: reg, color: WHITE,
    });
    page.drawText(`${FIRM.address}  |  Tel: ${FIRM.tel}  |  ${FIRM.email}  |  ${FIRM.web}`, {
        x: MARGIN, y: PAGE_HEIGHT - 60, size: 7, font: reg, color: WHITE,
    });
    return PAGE_HEIGHT - 90;
}

function drawFooter(page: PDFPage, reg: PDFFont, pg: number, total: number, draft = true): void {
    page.drawLine({ start: { x: MARGIN, y: 44 }, end: { x: PAGE_WIDTH - MARGIN, y: 44 }, thickness: 0.5, color: LIGHT });
    if (draft) {
        page.drawText('DRAFT — For review by authorised consultant before filing.', {
            x: MARGIN, y: 30, size: 7, font: reg, color: RED,
        });
    }
    page.drawText(`Page ${pg} of ${total}`, { x: PAGE_WIDTH - MARGIN - 55, y: 30, size: 7.5, font: reg, color: MID });
}

function sectionHeading(page: PDFPage, text: string, y: number, bold: PDFFont): number {
    page.drawRectangle({ x: MARGIN, y: y - 3, width: CONTENT_WIDTH, height: 18, color: NAVY });
    page.drawText(text.toUpperCase(), { x: MARGIN + 8, y: y + 3, size: 8.5, font: bold, color: WHITE });
    return y - 28;
}

function hRule(page: PDFPage, y: number, color: RGB = LIGHT): void {
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.4, color });
}

// ---------------------------------------------------------------------------
// Shared client info block
// ---------------------------------------------------------------------------

function drawClientBlock(
    page: PDFPage, input: CourtDocInput, y: number, bold: PDFFont, reg: PDFFont,
): number {
    const rows: [string, string][] = [
        ['Full Name:',      input.clientFullName],
        ['ID Number:',      input.clientIdNumber],
        ['Address:',        input.clientAddress  || '________________'],
        ['Phone:',          input.clientPhone    || '________________'],
        ['Email:',          input.clientEmail    || '________________'],
    ];
    if (input.jointClientFullName) {
        rows.push(['Joint Applicant:', input.jointClientFullName]);
        rows.push(['Joint ID:',        input.jointClientIdNumber || '________________']);
    }
    for (const [label, value] of rows) {
        page.drawText(label, { x: MARGIN + 8, y, size: 9, font: bold, color: MID });
        y = textBlock(page, value, MARGIN + 160, y + 1, CONTENT_WIDTH - 160, bold, reg, { size: 9 });
    }
    return y - 4;
}

// ---------------------------------------------------------------------------
// Accounts table — only called when accounts exist
// ---------------------------------------------------------------------------

function drawAccountsTable(
    page: PDFPage, accounts: CourtDocAccount[], y: number, bold: PDFFont, reg: PDFFont,
): number {
    const colX = [MARGIN + 8, MARGIN + 165, MARGIN + 265, MARGIN + 340, MARGIN + 415];
    const headers = ['Creditor / Account', 'Account No.', 'Balance (R)', 'Monthly (R)', 'Status'];

    // Header row
    page.drawRectangle({ x: MARGIN, y: y - 2, width: CONTENT_WIDTH, height: 16, color: AMBER });
    headers.forEach((h, i) => page.drawText(h, { x: colX[i], y: y + 1, size: 7.5, font: bold, color: NAVY }));
    y -= 20;

    for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        if (y < 80) break; // guard — in production add page break
        const bg = i % 2 === 0 ? LIGHT : WHITE;
        page.drawRectangle({ x: MARGIN, y: y - 3, width: CONTENT_WIDTH, height: 14, color: bg });

        const statusLabel = acc.hasPaidUpLetter
            ? 'PAID UP ✓'
            : acc.status === 'CLOSED' ? 'CLOSED'
            : acc.isPrescribed ? 'PRESCRIBED'
            : 'ACTIVE';

        const statusColor = acc.hasPaidUpLetter || acc.status === 'CLOSED'
            ? rgb(0.1, 0.5, 0.1)
            : acc.isPrescribed ? AMBER
            : DARK;

        const label = acc.creditorName + (acc.accountType ? ` (${acc.accountType})` : '');
        const lines = wrap(label, reg, 8, colX[1] - colX[0] - 4);

        page.drawText(lines[0] || '', { x: colX[0], y, size: 8, font: reg, color: DARK });
        page.drawText(acc.accountNumber || '—', { x: colX[1], y, size: 8, font: reg, color: DARK });
        page.drawText(zarFmt(acc.outstandingBalance), { x: colX[2], y, size: 8, font: reg, color: DARK });
        page.drawText(acc.monthlyInstalment ? zarFmt(acc.monthlyInstalment) : '—', { x: colX[3], y, size: 8, font: reg, color: DARK });
        page.drawText(statusLabel, { x: colX[4], y, size: 8, font: bold, color: statusColor });
        y -= 16;
    }

    const total = accounts.reduce((s, a) => s + (a.outstandingBalance || 0), 0);
    const monthly = accounts.reduce((s, a) => s + (a.monthlyInstalment || 0), 0);
    page.drawRectangle({ x: MARGIN, y: y - 3, width: CONTENT_WIDTH, height: 16, color: NAVY });
    page.drawText('TOTALS', { x: colX[0], y: y + 1, size: 8.5, font: bold, color: WHITE });
    page.drawText(zarFmt(total),   { x: colX[2], y: y + 1, size: 8.5, font: bold, color: WHITE });
    page.drawText(zarFmt(monthly), { x: colX[3], y: y + 1, size: 8.5, font: bold, color: WHITE });
    y -= 20;

    return y;
}

// ---------------------------------------------------------------------------
// Signature / deponent block
// ---------------------------------------------------------------------------

function drawSignature(
    page: PDFPage, name: string, title: string, y: number, reg: PDFFont, bold: PDFFont,
): number {
    y -= 8;
    page.drawText('Yours faithfully / Signed by:', { x: MARGIN, y, size: 9.5, font: reg, color: DARK });
    y -= 38;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 180, y }, thickness: 0.5, color: MID });
    y -= 13;
    page.drawText(name,             { x: MARGIN, y, size: 9.5, font: bold,  color: DARK });
    y -= 12;
    page.drawText(title,            { x: MARGIN, y, size: 8.5, font: reg,   color: MID });
    y -= 12;
    page.drawText(FIRM.name,        { x: MARGIN, y, size: 8.5, font: reg,   color: MID });
    y -= 11;
    page.drawText(`NCR Reg: ${FIRM.ncrdc}  |  DCASA: ${FIRM.dcasa}`, { x: MARGIN, y, size: 8, font: reg, color: MID });
    return y - 10;
}

// ============================================================================
// 1. NOTICE OF MOTION
// ============================================================================

async function generateNoticeOfMotion(input: CourtDocInput): Promise<Uint8Array> {
    const doc     = await PDFDocument.create();
    const bold    = await doc.embedFont(StandardFonts.HelveticaBold);
    const reg     = await doc.embedFont(StandardFonts.Helvetica);
    const page    = addPage(doc);
    const court   = input.courtName  || 'THE MAGISTRATE\'S COURT / HIGH COURT';
    const caseNo  = input.courtCaseNumber || '________________';
    const ref     = newRef('NOM');

    let y = drawLetterhead(page, bold, reg);
    y -= 12;

    // Court caption
    page.drawText('IN THE ' + court, { x: MARGIN, y, size: 11, font: bold, color: NAVY });
    y -= 16;
    page.drawText('HELD AT PRETORIA / TSHWANE', { x: MARGIN, y, size: 10, font: bold, color: NAVY });
    y -= 14;
    hRule(page, y, AMBER);
    y -= 18;

    page.drawText(`Case Number: ${caseNo}`, { x: MARGIN, y, size: 10, font: bold, color: DARK });
    y -= 14;
    page.drawText(`File Reference: ${input.fileNumber}`, { x: MARGIN, y, size: 9, font: reg, color: MID });
    y -= 20;

    // Parties
    page.drawText('In the matter between:', { x: MARGIN, y, size: 9.5, font: reg, color: DARK });
    y -= 16;
    page.drawText(input.clientFullName.toUpperCase(), { x: MARGIN + 20, y, size: 10, font: bold, color: DARK });
    page.drawText('APPLICANT', { x: PAGE_WIDTH - MARGIN - 70, y, size: 9.5, font: bold, color: DARK });
    y -= 12;
    if (input.jointClientFullName) {
        page.drawText(input.jointClientFullName.toUpperCase(), { x: MARGIN + 20, y, size: 10, font: bold, color: DARK });
        page.drawText('2ND APPLICANT', { x: PAGE_WIDTH - MARGIN - 90, y, size: 9.5, font: bold, color: DARK });
        y -= 12;
    }
    page.drawText('and', { x: MARGIN + 20, y, size: 9.5, font: reg, color: MID });
    y -= 12;
    page.drawText('THE NATIONAL CREDIT REGULATOR', { x: MARGIN + 20, y, size: 10, font: bold, color: DARK });
    page.drawText('RESPONDENT', { x: PAGE_WIDTH - MARGIN - 80, y, size: 9.5, font: bold, color: DARK });
    y -= 20;

    hRule(page, y, AMBER);
    y -= 16;

    page.drawText('NOTICE OF MOTION', { x: MARGIN + CONTENT_WIDTH / 2 - 60, y, size: 13, font: bold, color: NAVY });
    y -= 20;
    hRule(page, y, LIGHT);
    y -= 16;

    y = textBlock(page,
        `TAKE NOTICE that on a date and time to be arranged with the Registrar of the above Honourable Court, the Applicant, ${input.clientFullName} (Identity Number: ${input.clientIdNumber}), will make an application for the following relief:`,
        MARGIN, y, CONTENT_WIDTH, bold, reg);
    y -= 12;

    y = sectionHeading(page, 'Relief Sought', y, bold);
    const relief = [
        `An order directing the National Credit Regulator and all registered credit bureaux (TransUnion, Experian, XDS, and Compuscan) to remove the debt review flag / Form 17.W notation from the credit record of the Applicant, ${input.clientFullName} (ID: ${input.clientIdNumber}).`,
        'An order declaring that the Applicant has been unconditionally rehabilitated from debt review in terms of the National Credit Act 34 of 2005.',
        'An order declaring that all obligations under the debt review process have been fulfilled and/or that the debt review has been lawfully terminated.',
        'Costs of application, if opposed.',
        'Further and/or alternative relief as the Honourable Court may deem just and equitable.',
    ];
    for (let i = 0; i < relief.length; i++) {
        y = textBlock(page, `${i + 1}. ${relief[i]}`, MARGIN + 8, y, CONTENT_WIDTH - 8, bold, reg, { size: 9 });
        y -= 6;
    }
    y -= 4;

    y = sectionHeading(page, 'Supporting Documents', y, bold);
    y = textBlock(page,
        'This application is supported by the Founding Affidavit of the Applicant, together with the following annexures:',
        MARGIN + 8, y, CONTENT_WIDTH - 8, bold, reg, { size: 9 });
    y -= 8;
    const annexures = [
        'Annexure "A" — Certified copy of Identity Document',
        'Annexure "B" — Signed Power of Attorney',
        'Annexure "C" — Proof of debt review status / Form 17.W',
    ];
    if ((input.creditAccounts?.length ?? 0) > 0) {
        annexures.push('Annexure "D" — Schedule of credit accounts and current balances');
    }
    const paidUp = (input.creditAccounts ?? []).filter(a => a.hasPaidUpLetter || a.status === 'CLOSED');
    if (paidUp.length > 0) {
        annexures.push(`Annexure "E" — Paid-up letters in respect of ${paidUp.length} settled account(s)`);
    }
    for (const ann of annexures) {
        y = textBlock(page, `• ${ann}`, MARGIN + 12, y, CONTENT_WIDTH - 12, bold, reg, { size: 9 });
        y -= 4;
    }
    y -= 12;

    y = textBlock(page,
        `TAKE FURTHER NOTICE that the Applicant intends to make use of the aforesaid Founding Affidavit and annexures at the hearing of this application.`,
        MARGIN, y, CONTENT_WIDTH, bold, reg, { size: 9.5 });
    y -= 14;

    y = textBlock(page,
        `DATED at MABOPANE on this _______ day of _________________ ${new Date().getFullYear()}.`,
        MARGIN, y, CONTENT_WIDTH, bold, reg, { size: 9.5 });
    y -= 16;

    y = drawSignature(page, FIRM.dc, `Debt Counsellor — ${FIRM.ncrdc}`, y, reg, bold);

    page.drawText(`Ref: ${ref}  |  Generated: ${today()}`, { x: MARGIN, y: y - 10, size: 7, font: reg, color: MID });

    drawFooter(page, reg, 1, 1);
    return doc.save();
}

// ============================================================================
// 2. FOUNDING AFFIDAVIT
// ============================================================================

async function generateFoundingAffidavit(input: CourtDocInput): Promise<Uint8Array> {
    const doc    = await PDFDocument.create();
    const bold   = await doc.embedFont(StandardFonts.HelveticaBold);
    const reg    = await doc.embedFont(StandardFonts.Helvetica);
    const pages: PDFPage[] = [];

    function np(): PDFPage {
        const p = addPage(doc);
        pages.push(p);
        return p;
    }

    let page = np();
    const court  = input.courtName || 'THE MAGISTRATE\'S COURT / HIGH COURT';
    const caseNo = input.courtCaseNumber || '________________';
    const ref    = newRef('FA');

    let y = drawLetterhead(page, bold, reg);
    y -= 12;

    page.drawText('IN THE ' + court, { x: MARGIN, y, size: 11, font: bold, color: NAVY });
    y -= 16;
    page.drawText('HELD AT PRETORIA / TSHWANE', { x: MARGIN, y, size: 10, font: bold, color: NAVY });
    y -= 14;
    hRule(page, y, AMBER);
    y -= 18;

    page.drawText(`Case Number: ${caseNo}`, { x: MARGIN, y, size: 10, font: bold, color: DARK });
    y -= 20;

    page.drawText('In the matter between:', { x: MARGIN, y, size: 9.5, font: reg, color: DARK });
    y -= 16;
    page.drawText(input.clientFullName.toUpperCase(), { x: MARGIN + 20, y, size: 10, font: bold, color: DARK });
    page.drawText('APPLICANT', { x: PAGE_WIDTH - MARGIN - 70, y, size: 9.5, font: bold, color: DARK });
    y -= 12;
    if (input.jointClientFullName) {
        page.drawText(input.jointClientFullName.toUpperCase(), { x: MARGIN + 20, y, size: 10, font: bold, color: DARK });
        page.drawText('2ND APPLICANT', { x: PAGE_WIDTH - MARGIN - 90, y, size: 9.5, font: bold, color: DARK });
        y -= 12;
    }
    page.drawText('and', { x: MARGIN + 20, y, size: 9.5, font: reg, color: MID });
    y -= 12;
    page.drawText('THE NATIONAL CREDIT REGULATOR', { x: MARGIN + 20, y, size: 10, font: bold, color: DARK });
    page.drawText('RESPONDENT', { x: PAGE_WIDTH - MARGIN - 80, y, size: 9.5, font: bold, color: DARK });
    y -= 20;

    hRule(page, y, AMBER);
    y -= 16;

    page.drawText('FOUNDING AFFIDAVIT', { x: MARGIN + CONTENT_WIDTH / 2 - 65, y, size: 13, font: bold, color: NAVY });
    y -= 20;

    y = textBlock(page, `I, the undersigned,`, MARGIN, y, CONTENT_WIDTH, bold, reg);
    y -= 6;
    page.drawText(input.clientFullName.toUpperCase(), { x: MARGIN + 8, y, size: 11, font: bold, color: DARK });
    y -= 16;
    y = textBlock(page, `do hereby make oath and say as follows:`, MARGIN, y, CONTENT_WIDTH, bold, reg);
    y -= 14;

    // Para 1 — Identification
    y = sectionHeading(page, '1. Personal Details of Deponent', y, bold);
    y = drawClientBlock(page, input, y, bold, reg);
    y -= 8;

    // Para 2 — Authority
    y = sectionHeading(page, '2. Capacity and Authority', y, bold);
    y = textBlock(page,
        `2.1  I am an adult South African citizen and the Applicant in this matter. I am duly authorised to depose to this affidavit.`,
        MARGIN + 8, y, CONTENT_WIDTH - 8, bold, reg, { size: 9.5 });
    y -= 4;
    y = textBlock(page,
        `2.2  The facts contained in this affidavit are within my personal knowledge and belief, save where otherwise stated, and are to the best of my knowledge both true and correct.`,
        MARGIN + 8, y, CONTENT_WIDTH - 8, bold, reg, { size: 9.5 });
    y -= 12;

    // Para 3 — Background
    y = sectionHeading(page, '3. Background — Debt Review Application', y, bold);
    y = textBlock(page,
        `3.1  I previously applied for debt review in terms of Section 86 of the National Credit Act 34 of 2005 (the "NCA"). The debt review was registered with the National Credit Regulator under file reference ${input.fileNumber}.`,
        MARGIN + 8, y, CONTENT_WIDTH - 8, bold, reg, { size: 9.5 });
    y -= 4;
    y = textBlock(page,
        `3.2  As a result of the debt review process, a debt review flag was placed on my credit record with the relevant credit bureaux (TransUnion, Experian, XDS, and Compuscan). This listing continues to appear on my credit profile.`,
        MARGIN + 8, y, CONTENT_WIDTH - 8, bold, reg, { size: 9.5 });
    y -= 4;
    y = textBlock(page,
        `3.3  I now apply to this Honourable Court for an order directing the removal of the debt review flag / Form 17.W notation from my credit record on the grounds set out below.`,
        MARGIN + 8, y, CONTENT_WIDTH - 8, bold, reg, { size: 9.5 });
    y -= 12;

    // Para 4 — Grounds for removal (conditional on accounts)
    const accounts = input.creditAccounts ?? [];
    const paidUpAccounts = accounts.filter(a => a.hasPaidUpLetter || a.status === 'CLOSED');
    const hasAccounts = accounts.length > 0;
    const hasPaidUp   = paidUpAccounts.length > 0;

    if (y < 150) { page = np(); y = drawLetterhead(page, bold, reg); y -= 20; }

    y = sectionHeading(page, '4. Grounds for Removal of Debt Review Flag', y, bold);
    y = textBlock(page,
        `4.1  I submit that I am entitled to the removal of the debt review flag on the following grounds:`,
        MARGIN + 8, y, CONTENT_WIDTH - 8, bold, reg, { size: 9.5 });
    y -= 8;

    const grounds: string[] = [];
    if (hasPaidUp) {
        grounds.push(`I have settled ${paidUpAccounts.length} credit account(s) in full, in respect of which paid-up letters have been obtained from the respective credit providers. These are annexed hereto as Annexure "E".`);
    }
    if (hasAccounts && !hasPaidUp) {
        grounds.push(`I have restructured and/or settled my credit obligations as set out in the schedule of accounts annexed hereto as Annexure "D".`);
    }
    grounds.push(`The purposes for which the debt review was undertaken have been fulfilled and/or the circumstances giving rise to the over-indebtedness no longer exist.`);
    grounds.push(`The continued listing of the debt review flag on my credit record is causing me material prejudice and is not warranted in the circumstances.`);
    grounds.push(`I am no longer over-indebted within the meaning of Section 79 of the NCA.`);

    for (let i = 0; i < grounds.length; i++) {
        if (y < 100) { page = np(); y = drawLetterhead(page, bold, reg); y -= 20; }
        y = textBlock(page, `4.${i + 2}  ${grounds[i]}`, MARGIN + 8, y, CONTENT_WIDTH - 8, bold, reg, { size: 9.5 });
        y -= 4;
    }
    y -= 8;

    // Para 5 — Accounts table (only if accounts exist)
    if (hasAccounts) {
        if (y < 200) { page = np(); y = drawLetterhead(page, bold, reg); y -= 20; }
        y = sectionHeading(page, '5. Schedule of Credit Accounts (Annexure "D")', y, bold);
        y = textBlock(page,
            `5.1  Attached hereto as Annexure "D" is a full schedule of my credit accounts. The current status of each account is reflected below:`,
            MARGIN + 8, y, CONTENT_WIDTH - 8, bold, reg, { size: 9 });
        y -= 10;
        y = drawAccountsTable(page, accounts, y, bold, reg);
        y -= 8;

        if (hasPaidUp) {
            y = textBlock(page,
                `5.2  Accounts marked "PAID UP ✓" are fully settled. Paid-up letters confirming a zero balance have been received from the respective credit providers and are annexed hereto as Annexure "E".`,
                MARGIN + 8, y, CONTENT_WIDTH - 8, bold, reg, { size: 9 });
            y -= 8;
        }
    }

    // Para 6 — Paid-up letters detail (only if paid-up accounts exist)
    if (hasPaidUp) {
        if (y < 150) { page = np(); y = drawLetterhead(page, bold, reg); y -= 20; }
        const nextPara = hasAccounts ? 6 : 5;
        y = sectionHeading(page, `${nextPara}. Paid-Up Letters / Settlement Confirmations (Annexure "E")`, y, bold);
        y = textBlock(page,
            `${nextPara}.1  The following credit accounts have been settled in full and paid-up letters have been obtained:`,
            MARGIN + 8, y, CONTENT_WIDTH - 8, bold, reg, { size: 9.5 });
        y -= 10;
        for (let i = 0; i < paidUpAccounts.length; i++) {
            const acc = paidUpAccounts[i];
            if (y < 100) { page = np(); y = drawLetterhead(page, bold, reg); y -= 20; }
            y = textBlock(page,
                `${nextPara}.${i + 2}  ${acc.creditorName}${acc.accountNumber ? ` (Account No. ${acc.accountNumber})` : ''}: Balance R0.00 — Paid-up letter dated ${fmtDate(acc.paidUpDate)}.${acc.letterReference ? ` Ref: ${acc.letterReference}.` : ''}`,
                MARGIN + 8, y, CONTENT_WIDTH - 8, bold, reg, { size: 9.5 });
            y -= 4;
        }
        y -= 8;
    }

    // Concluding paragraph
    const lastPara = hasAccounts && hasPaidUp ? 7 : hasAccounts || hasPaidUp ? 6 : 5;
    if (y < 150) { page = np(); y = drawLetterhead(page, bold, reg); y -= 20; }
    y = sectionHeading(page, `${lastPara}. Conclusion and Relief`, y, bold);
    y = textBlock(page,
        `${lastPara}.1  I respectfully submit that on the basis of the facts set out above, and the supporting documentation annexed hereto, this Honourable Court should grant the relief sought in the Notice of Motion.`,
        MARGIN + 8, y, CONTENT_WIDTH - 8, bold, reg, { size: 9.5 });
    y -= 8;
    y = textBlock(page,
        `${lastPara}.2  I confirm that there is no other pending application or court order dealing with the same subject matter in any other court.`,
        MARGIN + 8, y, CONTENT_WIDTH - 8, bold, reg, { size: 9.5 });
    y -= 14;

    // Deponent block
    y = sectionHeading(page, 'Deponent / Verification', y, bold);
    y = textBlock(page,
        `I hereby certify that the Deponent has acknowledged that they know and understand the contents of this affidavit, that it is true and correct, that they have no objection to taking the prescribed oath / affirmation, and that the prescribed oath / affirmation has been duly administered.`,
        MARGIN + 8, y, CONTENT_WIDTH - 8, bold, reg, { size: 9 });
    y -= 20;

    // Two signature columns
    const col2X = MARGIN + CONTENT_WIDTH / 2 + 20;
    page.drawLine({ start: { x: MARGIN,  y }, end: { x: MARGIN + 160,  y }, thickness: 0.5, color: MID });
    page.drawLine({ start: { x: col2X, y }, end: { x: col2X + 160, y }, thickness: 0.5, color: MID });
    y -= 12;
    page.drawText('DEPONENT', { x: MARGIN, y, size: 8.5, font: bold, color: DARK });
    page.drawText('COMMISSIONER OF OATHS', { x: col2X, y, size: 8.5, font: bold, color: DARK });
    y -= 11;
    page.drawText(input.clientFullName, { x: MARGIN, y, size: 8, font: reg, color: MID });
    y -= 11;
    page.drawText(`Date: ___________________`, { x: MARGIN, y, size: 8, font: reg, color: DARK });
    page.drawText(`Date: ___________________`, { x: col2X,  y, size: 8, font: reg, color: DARK });
    y -= 11;
    page.drawText(`Place: __________________`, { x: MARGIN, y, size: 8, font: reg, color: DARK });
    page.drawText(`Name: ___________________`, { x: col2X,  y, size: 8, font: reg, color: DARK });
    y -= 11;
    page.drawText(``, { x: col2X, y, size: 8, font: reg, color: DARK });
    page.drawText(`Designation: ____________`, { x: col2X,  y, size: 8, font: reg, color: DARK });
    y -= 20;

    page.drawText(`Ref: ${ref}  |  Generated: ${today()}`, { x: MARGIN, y, size: 7, font: reg, color: MID });

    const total = pages.length;
    pages.forEach((p, i) => drawFooter(p, reg, i + 1, total));
    return doc.save();
}

// ============================================================================
// 3. NOTICE OF SET DOWN
// ============================================================================

async function generateNoticeOfSetDown(input: CourtDocInput): Promise<Uint8Array> {
    const doc   = await PDFDocument.create();
    const bold  = await doc.embedFont(StandardFonts.HelveticaBold);
    const reg   = await doc.embedFont(StandardFonts.Helvetica);
    const page  = addPage(doc);
    const court = input.courtName || 'THE MAGISTRATE\'S COURT / HIGH COURT';
    const caseNo = input.courtCaseNumber || '________________';
    const ref   = newRef('NSD');

    let y = drawLetterhead(page, bold, reg);
    y -= 12;

    page.drawText('IN THE ' + court, { x: MARGIN, y, size: 11, font: bold, color: NAVY });
    y -= 14;
    page.drawText('HELD AT PRETORIA / TSHWANE', { x: MARGIN, y, size: 10, font: bold, color: NAVY });
    y -= 12;
    hRule(page, y, AMBER);
    y -= 18;

    page.drawText(`Case Number: ${caseNo}`, { x: MARGIN, y, size: 10, font: bold, color: DARK });
    y -= 20;

    page.drawText('In the matter between:', { x: MARGIN, y, size: 9.5, font: reg, color: DARK });
    y -= 16;
    page.drawText(input.clientFullName.toUpperCase(), { x: MARGIN + 20, y, size: 10, font: bold, color: DARK });
    page.drawText('APPLICANT', { x: PAGE_WIDTH - MARGIN - 70, y, size: 9.5, font: bold, color: DARK });
    y -= 12;
    page.drawText('and', { x: MARGIN + 20, y, size: 9.5, font: reg, color: MID });
    y -= 12;
    page.drawText('THE NATIONAL CREDIT REGULATOR', { x: MARGIN + 20, y, size: 10, font: bold, color: DARK });
    page.drawText('RESPONDENT', { x: PAGE_WIDTH - MARGIN - 80, y, size: 9.5, font: bold, color: DARK });
    y -= 20;

    hRule(page, y, AMBER);
    y -= 16;

    page.drawText('NOTICE OF SET DOWN', { x: MARGIN + CONTENT_WIDTH / 2 - 68, y, size: 13, font: bold, color: NAVY });
    y -= 20;

    y = textBlock(page,
        `TO:  THE REGISTRAR OF THE ABOVE HONOURABLE COURT`,
        MARGIN, y, CONTENT_WIDTH, bold, reg, { font: bold });
    y -= 6;
    y = textBlock(page,
        `AND TO:  THE NATIONAL CREDIT REGULATOR — Respondent`,
        MARGIN, y, CONTENT_WIDTH, bold, reg, { font: bold });
    y -= 16;

    y = textBlock(page,
        `KINDLY TAKE NOTICE that the above-mentioned application has been SET DOWN for hearing before the above Honourable Court as follows:`,
        MARGIN, y, CONTENT_WIDTH, bold, reg);
    y -= 14;

    y = sectionHeading(page, 'Hearing Details', y, bold);
    const details: [string, string][] = [
        ['Date of Hearing:',   '________________'],
        ['Time:',              '________________  (or as soon thereafter as the matter may be heard)'],
        ['Venue / Court Room:', '________________'],
        ['Presiding Officer:', '________________'],
        ['Case Number:',       caseNo],
        ['Nature of Application:', 'Application for Removal of Debt Review Flag — NCA Section 71'],
    ];
    for (const [label, value] of details) {
        page.drawText(label, { x: MARGIN + 8, y, size: 9, font: bold, color: MID });
        y = textBlock(page, value, MARGIN + 200, y + 1, CONTENT_WIDTH - 200, bold, reg, { size: 9 });
    }
    y -= 8;

    y = sectionHeading(page, 'Documents Filed', y, bold);
    y = textBlock(page,
        'The following documents have been filed of record and will be relied upon at the hearing:',
        MARGIN + 8, y, CONTENT_WIDTH - 8, bold, reg, { size: 9 });
    y -= 8;
    const docs = [
        'Notice of Motion',
        'Founding Affidavit of ' + input.clientFullName + ' with Annexures',
    ];
    if ((input.creditAccounts?.length ?? 0) > 0) {
        docs.push('Annexure "D" — Schedule of Credit Accounts');
    }
    const paidUpAccts = (input.creditAccounts ?? []).filter(a => a.hasPaidUpLetter || a.status === 'CLOSED');
    if (paidUpAccts.length > 0) {
        docs.push(`Annexure "E" — Paid-up Letters (${paidUpAccts.length} account(s))`);
    }
    docs.push('Proof of Service on Respondent');
    for (const d of docs) {
        y = textBlock(page, `• ${d}`, MARGIN + 12, y, CONTENT_WIDTH - 12, bold, reg, { size: 9 });
        y -= 4;
    }
    y -= 14;

    y = textBlock(page,
        `Should any party wish to oppose this application, a Notice of Opposition together with an Answering Affidavit must be delivered no later than ________________ in terms of the applicable Rules of Court.`,
        MARGIN, y, CONTENT_WIDTH, bold, reg, { size: 9.5 });
    y -= 14;

    y = textBlock(page,
        `DATED at MABOPANE on this _______ day of _________________ ${new Date().getFullYear()}.`,
        MARGIN, y, CONTENT_WIDTH, bold, reg);
    y -= 16;

    y = drawSignature(page, FIRM.dc, `Debt Counsellor — ${FIRM.ncrdc}`, y, reg, bold);
    page.drawText(`Ref: ${ref}  |  Generated: ${today()}`, { x: MARGIN, y: y - 10, size: 7, font: reg, color: MID });

    drawFooter(page, reg, 1, 1);
    return doc.save();
}

// ============================================================================
// 4. NOTICE OF MOTION — RESCISSION
// ============================================================================

async function generateNoticeOfMotionRescission(input: CourtDocInput): Promise<Uint8Array> {
    const doc    = await PDFDocument.create();
    const bold   = await doc.embedFont(StandardFonts.HelveticaBold);
    const reg    = await doc.embedFont(StandardFonts.Helvetica);
    const page   = addPage(doc);
    const court  = input.courtName || 'THE MAGISTRATE\'S COURT / HIGH COURT';
    const caseNo = input.courtCaseNumber || '________________';
    const ref    = newRef('NMR');

    let y = drawLetterhead(page, bold, reg);
    y -= 12;

    page.drawText('IN THE ' + court, { x: MARGIN, y, size: 11, font: bold, color: NAVY });
    y -= 14;
    page.drawText('HELD AT PRETORIA / TSHWANE', { x: MARGIN, y, size: 10, font: bold, color: NAVY });
    y -= 12;
    hRule(page, y, AMBER);
    y -= 18;

    page.drawText(`Case Number: ${caseNo}`, { x: MARGIN, y, size: 10, font: bold, color: DARK });
    y -= 20;

    page.drawText('In the matter between:', { x: MARGIN, y, size: 9.5, font: reg, color: DARK });
    y -= 16;
    page.drawText(input.clientFullName.toUpperCase(), { x: MARGIN + 20, y, size: 10, font: bold, color: DARK });
    page.drawText('APPLICANT', { x: PAGE_WIDTH - MARGIN - 70, y, size: 9.5, font: bold, color: DARK });
    y -= 12;
    page.drawText('and', { x: MARGIN + 20, y, size: 9.5, font: reg, color: MID });
    y -= 12;
    page.drawText('THE NATIONAL CREDIT REGULATOR', { x: MARGIN + 20, y, size: 10, font: bold, color: DARK });
    page.drawText('RESPONDENT', { x: PAGE_WIDTH - MARGIN - 80, y, size: 9.5, font: bold, color: DARK });
    y -= 20;

    hRule(page, y, AMBER);
    y -= 16;

    page.drawText('NOTICE OF MOTION — RESCISSION APPLICATION', { x: MARGIN + CONTENT_WIDTH / 2 - 130, y, size: 12, font: bold, color: NAVY });
    y -= 20;
    hRule(page, y, LIGHT);
    y -= 16;

    y = textBlock(page,
        `TAKE NOTICE that the Applicant, ${input.clientFullName} (Identity Number: ${input.clientIdNumber}), intends to bring an application before this Honourable Court for the rescission and/or variation of the debt review order / consent order previously granted in relation to the Applicant's debt review, on the following grounds:`,
        MARGIN, y, CONTENT_WIDTH, bold, reg);
    y -= 12;

    y = sectionHeading(page, 'Grounds for Rescission / Variation', y, bold);
    const rescissionGrounds = [
        'The Applicant has settled all or substantially all credit obligations that were the subject of the debt review, and is no longer over-indebted within the meaning of Section 79 of the NCA.',
        'The circumstances that gave rise to the over-indebtedness no longer exist, and the Applicant is capable of meeting their financial obligations without a debt restructuring arrangement.',
        'The continued operation of the original order causes undue prejudice to the Applicant by preventing access to credit, housing finance, and other financial services.',
        'It is just and equitable that the order be rescinded / varied, having regard to the interests of all parties.',
    ];
    if ((input.creditAccounts ?? []).filter(a => a.hasPaidUpLetter || a.status === 'CLOSED').length > 0) {
        rescissionGrounds.splice(0, 0,
            `The Applicant has obtained paid-up letters from ${(input.creditAccounts ?? []).filter(a => a.hasPaidUpLetter || a.status === 'CLOSED').length} credit provider(s) confirming settlement in full. These are attached as Annexure "E".`
        );
    }
    for (let i = 0; i < rescissionGrounds.length; i++) {
        y = textBlock(page, `${i + 1}. ${rescissionGrounds[i]}`, MARGIN + 8, y, CONTENT_WIDTH - 8, bold, reg, { size: 9 });
        y -= 6;
    }
    y -= 4;

    y = sectionHeading(page, 'Relief Sought', y, bold);
    const rescissionRelief = [
        'An order rescinding and/or varying the debt review order / consent order previously granted.',
        'An order directing the National Credit Regulator and all registered credit bureaux to remove the debt review flag / Form 17.W notation from the Applicant\'s credit record.',
        'An order declaring that the Applicant\'s debt review obligations have been fully discharged.',
        'Costs of application, if opposed.',
        'Further and/or alternative relief as this Honourable Court may deem just and equitable.',
    ];
    for (let i = 0; i < rescissionRelief.length; i++) {
        y = textBlock(page, `${i + 1}. ${rescissionRelief[i]}`, MARGIN + 8, y, CONTENT_WIDTH - 8, bold, reg, { size: 9 });
        y -= 5;
    }
    y -= 10;

    y = textBlock(page,
        `This application is supported by the Founding Affidavit of the Applicant, which sets out the full grounds and supporting evidence.`,
        MARGIN, y, CONTENT_WIDTH, bold, reg, { size: 9.5 });
    y -= 14;

    y = textBlock(page,
        `DATED at MABOPANE on this _______ day of _________________ ${new Date().getFullYear()}.`,
        MARGIN, y, CONTENT_WIDTH, bold, reg);
    y -= 16;

    y = drawSignature(page, FIRM.dc, `Debt Counsellor — ${FIRM.ncrdc}`, y, reg, bold);
    page.drawText(`Ref: ${ref}  |  Generated: ${today()}`, { x: MARGIN, y: y - 10, size: 7, font: reg, color: MID });

    drawFooter(page, reg, 1, 1);
    return doc.save();
}

// ============================================================================
// 5. COURT ORDER GRANTED
// ============================================================================

async function generateCourtOrderGranted(input: CourtDocInput): Promise<Uint8Array> {
    const doc    = await PDFDocument.create();
    const bold   = await doc.embedFont(StandardFonts.HelveticaBold);
    const reg    = await doc.embedFont(StandardFonts.Helvetica);
    const page   = addPage(doc);
    const court  = input.courtName || 'THE MAGISTRATE\'S COURT / HIGH COURT';
    const caseNo = input.courtCaseNumber || '________________';
    const ref    = newRef('CO');
    const accounts = input.creditAccounts ?? [];
    const creditProviders = [...new Set(accounts.map(a => a.creditorName))];

    let y = drawLetterhead(page, bold, reg);
    y -= 12;

    page.drawText('IN THE ' + court, { x: MARGIN, y, size: 11, font: bold, color: NAVY });
    y -= 14;
    page.drawText('HELD AT PRETORIA / TSHWANE', { x: MARGIN, y, size: 10, font: bold, color: NAVY });
    y -= 12;
    hRule(page, y, AMBER);
    y -= 18;

    page.drawText(`Case Number: ${caseNo}`, { x: MARGIN, y, size: 10, font: bold, color: DARK });
    page.drawText(`Date: ${today()}`, { x: PAGE_WIDTH - MARGIN - 130, y, size: 9.5, font: reg, color: DARK });
    y -= 20;

    page.drawText('In the matter between:', { x: MARGIN, y, size: 9.5, font: reg, color: DARK });
    y -= 16;
    page.drawText(input.clientFullName.toUpperCase(), { x: MARGIN + 20, y, size: 10, font: bold, color: DARK });
    page.drawText('APPLICANT', { x: PAGE_WIDTH - MARGIN - 70, y, size: 9.5, font: bold, color: DARK });
    y -= 12;
    page.drawText('and', { x: MARGIN + 20, y, size: 9.5, font: reg, color: MID });
    y -= 12;
    page.drawText('THE NATIONAL CREDIT REGULATOR', { x: MARGIN + 20, y, size: 10, font: bold, color: DARK });
    page.drawText('RESPONDENT', { x: PAGE_WIDTH - MARGIN - 80, y, size: 9.5, font: bold, color: DARK });
    y -= 20;

    hRule(page, y, AMBER);
    y -= 16;

    page.drawText('COURT ORDER', { x: MARGIN + CONTENT_WIDTH / 2 - 40, y, size: 14, font: bold, color: NAVY });
    y -= 22;

    y = textBlock(page,
        `Having heard this matter on _________________ and having considered the application, affidavit, and supporting documents filed of record:`,
        MARGIN, y, CONTENT_WIDTH, bold, reg);
    y -= 14;

    y = textBlock(page, 'IT IS ORDERED THAT:', MARGIN, y, CONTENT_WIDTH, bold, reg, { font: bold, size: 11, color: NAVY });
    y -= 4;
    hRule(page, y, AMBER);
    y -= 14;

    const orders = [
        `The debt review flag and/or Form 17.W notation currently appearing on the credit record of ${input.clientFullName} (Identity Number: ${input.clientIdNumber}) is hereby ordered to be removed.`,
        'The National Credit Regulator is directed to update its records accordingly and to issue a clearance certificate in terms of Section 71 of the National Credit Act 34 of 2005.',
        'TransUnion Credit Bureau is directed to remove the debt review flag from the Applicant\'s credit profile within 5 (five) business days of being served with this order.',
        'Experian South Africa (Pty) Ltd is directed to remove the debt review flag from the Applicant\'s credit profile within 5 (five) business days of being served with this order.',
        'XDS Credit Bureau is directed to remove the debt review flag from the Applicant\'s credit profile within 5 (five) business days of being served with this order.',
        'Compuscan (Pty) Ltd is directed to remove the debt review flag from the Applicant\'s credit profile within 5 (five) business days of being served with this order.',
    ];

    if (creditProviders.length > 0) {
        orders.push(
            `The following credit providers are directed to update their records to reflect the current account status and to cease any adverse reporting related to the debt review in respect of the Applicant: ${creditProviders.join(', ')}.`
        );
    }

    orders.push(
        'There is no order as to costs / Costs are awarded to the Applicant on the _________________ scale.',
    );

    for (let i = 0; i < orders.length; i++) {
        y = textBlock(page, `${i + 1}.  ${orders[i]}`, MARGIN + 8, y, CONTENT_WIDTH - 8, bold, reg, { size: 9.5 });
        y -= 8;
    }
    y -= 10;

    // Judge signature
    hRule(page, y, LIGHT);
    y -= 20;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 200, y }, thickness: 0.5, color: MID });
    y -= 13;
    page.drawText('JUDGE / MAGISTRATE', { x: MARGIN, y, size: 9.5, font: bold, color: DARK });
    y -= 12;
    page.drawText('Presiding Officer', { x: MARGIN, y, size: 8.5, font: reg, color: MID });
    y -= 12;
    page.drawText(court, { x: MARGIN, y, size: 8, font: reg, color: MID });
    y -= 20;

    page.drawText(`Ref: ${ref}  |  Generated: ${today()}`, { x: MARGIN, y, size: 7, font: reg, color: MID });

    drawFooter(page, reg, 1, 1, false);
    return doc.save();
}

// ============================================================================
// 6. PROOF OF SERVICE
// ============================================================================

async function generateProofOfService(input: CourtDocInput): Promise<Uint8Array> {
    const doc    = await PDFDocument.create();
    const bold   = await doc.embedFont(StandardFonts.HelveticaBold);
    const reg    = await doc.embedFont(StandardFonts.Helvetica);
    const page   = addPage(doc);
    const court  = input.courtName || 'THE MAGISTRATE\'S COURT / HIGH COURT';
    const caseNo = input.courtCaseNumber || '________________';
    const ref    = newRef('PS');

    let y = drawLetterhead(page, bold, reg);
    y -= 12;

    page.drawText('IN THE ' + court, { x: MARGIN, y, size: 11, font: bold, color: NAVY });
    y -= 14;
    page.drawText('HELD AT PRETORIA / TSHWANE', { x: MARGIN, y, size: 10, font: bold, color: NAVY });
    y -= 12;
    hRule(page, y, AMBER);
    y -= 18;

    page.drawText(`Case Number: ${caseNo}`, { x: MARGIN, y, size: 10, font: bold, color: DARK });
    y -= 20;

    page.drawText('In the matter between:', { x: MARGIN, y, size: 9.5, font: reg, color: DARK });
    y -= 16;
    page.drawText(input.clientFullName.toUpperCase(), { x: MARGIN + 20, y, size: 10, font: bold, color: DARK });
    page.drawText('APPLICANT', { x: PAGE_WIDTH - MARGIN - 70, y, size: 9.5, font: bold, color: DARK });
    y -= 12;
    page.drawText('and', { x: MARGIN + 20, y, size: 9.5, font: reg, color: MID });
    y -= 12;
    page.drawText('THE NATIONAL CREDIT REGULATOR', { x: MARGIN + 20, y, size: 10, font: bold, color: DARK });
    page.drawText('RESPONDENT', { x: PAGE_WIDTH - MARGIN - 80, y, size: 9.5, font: bold, color: DARK });
    y -= 20;

    hRule(page, y, AMBER);
    y -= 16;

    page.drawText('AFFIDAVIT OF SERVICE / PROOF OF SERVICE', { x: MARGIN + CONTENT_WIDTH / 2 - 100, y, size: 12, font: bold, color: NAVY });
    y -= 20;

    y = textBlock(page, `I, the undersigned,`, MARGIN, y, CONTENT_WIDTH, bold, reg);
    y -= 8;
    page.drawText('_________________ (Full Name)', { x: MARGIN + 8, y, size: 10, font: bold, color: DARK });
    y -= 16;
    y = textBlock(page, `do hereby make oath and say:`, MARGIN, y, CONTENT_WIDTH, bold, reg);
    y -= 14;

    y = sectionHeading(page, '1. Deponent Details', y, bold);
    const deponentRows: [string, string][] = [
        ['Full Name:',    '_________________'],
        ['Capacity:',     '[ ] Sheriff   [ ] Process Server   [ ] Paralegal   [ ] Registered Attorney'],
        ['ID Number:',    '_________________'],
        ['Address:',      '_________________'],
        ['Employer:',     '_________________'],
    ];
    for (const [label, val] of deponentRows) {
        page.drawText(label, { x: MARGIN + 8, y, size: 9, font: bold, color: MID });
        y = textBlock(page, val, MARGIN + 140, y + 1, CONTENT_WIDTH - 140, bold, reg, { size: 9 });
    }
    y -= 8;

    y = sectionHeading(page, '2. Documents Served', y, bold);
    y = textBlock(page,
        'I hereby confirm that on _________________ at _______ (time), I served the following documents on the Respondent / interested parties:',
        MARGIN + 8, y, CONTENT_WIDTH - 8, bold, reg, { size: 9.5 });
    y -= 8;
    const docList = [
        'Notice of Motion',
        'Founding Affidavit with Annexures',
        'Notice of Set Down',
    ];
    if ((input.creditAccounts?.length ?? 0) > 0) docList.push('Annexure "D" — Schedule of Credit Accounts');
    const paidUp = (input.creditAccounts ?? []).filter(a => a.hasPaidUpLetter || a.status === 'CLOSED');
    if (paidUp.length > 0) docList.push(`Annexure "E" — Paid-up Letters (${paidUp.length} account(s))`);
    for (const d of docList) {
        y = textBlock(page, `• ${d}`, MARGIN + 12, y, CONTENT_WIDTH - 12, bold, reg, { size: 9 });
        y -= 4;
    }
    y -= 8;

    y = sectionHeading(page, '3. Manner of Service', y, bold);
    const serviceOptions = [
        '[ ] Personal service — handed directly to the Respondent / authorised representative',
        '[ ] Sheriff of the Court — served by the Sheriff under Case No. ' + caseNo,
        '[ ] Registered Post — proof of posting / tracking reference: _________________',
        '[ ] Electronic Service (where authorised) — email: _________________',
        '[ ] Left with person at the address (name: _________________)',
    ];
    for (const opt of serviceOptions) {
        y = textBlock(page, opt, MARGIN + 12, y, CONTENT_WIDTH - 12, bold, reg, { size: 9 });
        y -= 6;
    }
    y -= 8;

    y = sectionHeading(page, '4. Service on National Credit Regulator', y, bold);
    const ncrRows: [string, string][] = [
        ['NCR Address:',  '127 15th Road, Randjespark, Midrand, Johannesburg, 1685'],
        ['NCR Email:',    'info@ncr.org.za'],
        ['Date Served:',  '_________________'],
        ['Time Served:',  '_________________'],
        ['Served by:',    '_________________'],
    ];
    for (const [label, val] of ncrRows) {
        page.drawText(label, { x: MARGIN + 8, y, size: 9, font: bold, color: MID });
        y = textBlock(page, val, MARGIN + 160, y + 1, CONTENT_WIDTH - 160, bold, reg, { size: 9 });
    }
    y -= 12;

    y = textBlock(page,
        `I confirm that the above facts are true and correct to the best of my knowledge.`,
        MARGIN, y, CONTENT_WIDTH, bold, reg, { size: 9.5 });
    y -= 20;

    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 180, y }, thickness: 0.5, color: MID });
    y -= 12;
    page.drawText('DEPONENT', { x: MARGIN, y, size: 8.5, font: bold, color: DARK });
    y -= 12;
    page.drawText('Date: _________________', { x: MARGIN, y, size: 8.5, font: reg, color: DARK });
    y -= 20;

    page.drawText(`Ref: ${ref}  |  Generated: ${today()}`, { x: MARGIN, y, size: 7, font: reg, color: MID });

    drawFooter(page, reg, 1, 1);
    return doc.save();
}

// ============================================================================
// Main entry point
// ============================================================================

export async function generateCourtDoc(type: CourtDocType, input: CourtDocInput): Promise<Uint8Array> {
    switch (type) {
        case 'NOTICE_OF_MOTION':             return generateNoticeOfMotion(input);
        case 'FOUNDING_AFFIDAVIT':           return generateFoundingAffidavit(input);
        case 'NOTICE_OF_SET_DOWN':           return generateNoticeOfSetDown(input);
        case 'NOTICE_OF_MOTION_RESCISSION':  return generateNoticeOfMotionRescission(input);
        case 'COURT_ORDER_GRANTED':          return generateCourtOrderGranted(input);
        case 'PROOF_OF_SERVICE':             return generateProofOfService(input);
        default:
            throw new Error(`Unknown court document type: ${type}`);
    }
}

export const COURT_DOC_LABELS: Record<CourtDocType, string> = {
    NOTICE_OF_MOTION:            'Notice of Motion',
    FOUNDING_AFFIDAVIT:          'Founding Affidavit',
    NOTICE_OF_SET_DOWN:          'Notice of Set Down',
    NOTICE_OF_MOTION_RESCISSION: 'Notice of Motion — Rescission',
    COURT_ORDER_GRANTED:         'Court Order Granted',
    PROOF_OF_SERVICE:            'Proof of Service',
};

export const COURT_DOC_DESCRIPTIONS: Record<CourtDocType, string> = {
    NOTICE_OF_MOTION:            'Application to court for debt review flag removal',
    FOUNDING_AFFIDAVIT:          'Sworn statement with account schedule and paid-up letters',
    NOTICE_OF_SET_DOWN:          'Set hearing date for the application',
    NOTICE_OF_MOTION_RESCISSION: 'Rescission of the debt review court order',
    COURT_ORDER_GRANTED:         'Draft court order directing removal across all bureaux',
    PROOF_OF_SERVICE:            'Affidavit confirming service on respondent',
};
