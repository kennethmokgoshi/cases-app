import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';
import { logger } from '../logger';

// ---------------------------------------------------------------------------
// Zenowethu Company Constants
// ---------------------------------------------------------------------------

const ZDM = {
    name:    'Zenowethu Debt Management (PTY) LTD',
    regNo:   '2013/121120/07',
    ncrdc:   'NCRDC3693',
    dcasa:   'DCASA 0863',
    address: 'Suite 2, Second Floor, Central House, 17 Central Road, Mabopane, 0199',
    phone:   '012 035 1824',
    website: 'www.zenowethu.co.za',
    director: 'Aaron Nzotho',
    directorId: '7809065687086',
};

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

const NAVY   = rgb(0.05, 0.18, 0.38);
const TEAL   = rgb(0, 0.47, 0.47);
const DARK   = rgb(0.10, 0.10, 0.10);
const MID    = rgb(0.40, 0.40, 0.40);
const LIGHT  = rgb(0.88, 0.88, 0.88);
const WHITE  = rgb(1, 1, 1);
const GOLD   = rgb(0.80, 0.60, 0.10);

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const PAGE_WIDTH  = 595;
const PAGE_HEIGHT = 842;
const MARGIN      = 50;
const COL_WIDTH   = PAGE_WIDTH - MARGIN * 2;

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface StandardPoaInput {
    // Client (Principal)
    fullName:       string;
    idNumber:       string;
    dateOfBirth?:   string;   // DD/MM/YYYY
    address:        string;
    phone:          string;
    email:          string;
    // Transfer (optional)
    isTransfer?:           boolean;
    currentCounsellor?:    string;
    currentNcrdc?:         string;
    currentCounsellorTel?: string;
    // Meta
    signedAtCity?: string;
    signedDate?:   string;   // DD/MM/YYYY — leave blank = signature line only
}

export interface WesbankPoaInput {
    // Client (Principal/Grantor)
    clientFullName: string;
    clientIdNumber: string;
    clientAddress:  string;
    // Staff / Authorised Agent
    agentFullName:  string;
    agentIdNumber:  string;
    agentAddress:   string;
    // Meta
    signedAtCity?: string;
    signedDate?:   string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function drawRect(page: PDFPage, x: number, y: number, w: number, h: number, color: ReturnType<typeof rgb>) {
    page.drawRectangle({ x, y, width: w, height: h, color });
}

function drawLine(page: PDFPage, x1: number, y1: number, x2: number, y2: number, thickness = 0.5) {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color: LIGHT });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
            lines.push(line);
            line = word;
        } else {
            line = candidate;
        }
    }
    if (line) lines.push(line);
    return lines;
}

function drawWrapped(
    page: PDFPage, text: string, x: number, y: number, maxWidth: number,
    font: PDFFont, size: number, color = DARK, lineGap = 4
): number {
    const lines = wrapText(text, font, size, maxWidth);
    for (const l of lines) {
        page.drawText(l, { x, y, size, font, color });
        y -= size + lineGap;
    }
    return y;
}

// ---------------------------------------------------------------------------
// Section header (coloured band)
// ---------------------------------------------------------------------------

function drawSectionHeader(page: PDFPage, label: string, y: number, bold: PDFFont): number {
    drawRect(page, MARGIN, y - 16, COL_WIDTH, 18, NAVY);
    page.drawText(label, { x: MARGIN + 6, y: y - 12, size: 8.5, font: bold, color: WHITE });
    return y - 18;
}

// ---------------------------------------------------------------------------
// Labelled field row
// ---------------------------------------------------------------------------

function drawField(
    page: PDFPage, label: string, value: string,
    x: number, y: number, fieldWidth: number,
    regular: PDFFont, bold: PDFFont
): number {
    const ROW_H = 22;
    // border
    page.drawRectangle({ x, y: y - ROW_H, width: fieldWidth, height: ROW_H, borderColor: LIGHT, borderWidth: 0.5 });
    page.drawText(label, { x: x + 4, y: y - 9, size: 6.5, font: regular, color: MID });
    if (value) {
        page.drawText(value, { x: x + 4, y: y - 18, size: 9, font: bold, color: DARK });
    }
    return y - ROW_H;
}

// ---------------------------------------------------------------------------
// Letterhead
// ---------------------------------------------------------------------------

function drawLetterhead(page: PDFPage, bold: PDFFont, regular: PDFFont): number {
    // Header band
    drawRect(page, 0, PAGE_HEIGHT - 68, PAGE_WIDTH, 68, TEAL);
    // Gold accent stripe
    drawRect(page, 0, PAGE_HEIGHT - 70, PAGE_WIDTH, 2, GOLD);

    page.drawText('ZENOWETHU', { x: MARGIN, y: PAGE_HEIGHT - 28, size: 18, font: bold, color: WHITE });
    page.drawText('Debt Management', { x: MARGIN, y: PAGE_HEIGHT - 41, size: 9, font: regular, color: WHITE });
    page.drawText('Restoring ZEN  |  Est. 2013', { x: MARGIN, y: PAGE_HEIGHT - 52, size: 7, font: regular, color: rgb(0.85, 0.95, 0.95) });

    const rightX = PAGE_WIDTH - MARGIN;
    const lines = [
        `Reg DC: ${ZDM.ncrdc}  |  ${ZDM.dcasa}`,
        `${ZDM.phone}  |  ${ZDM.website}`,
        ZDM.address,
    ];
    lines.forEach((l, i) => {
        const w = regular.widthOfTextAtSize(l, 7);
        page.drawText(l, { x: rightX - w, y: PAGE_HEIGHT - 28 - i * 12, size: 7, font: regular, color: WHITE });
    });

    return PAGE_HEIGHT - 88;
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function drawFooter(page: PDFPage, regular: PDFFont, pageNum: number, total: number): void {
    drawLine(page, MARGIN, 38, PAGE_WIDTH - MARGIN, 38);
    page.drawText(`${ZDM.phone}  |  ${ZDM.website}  |  ${ZDM.address}`, {
        x: MARGIN, y: 26, size: 6.5, font: regular, color: MID,
    });
    page.drawText(`Page ${pageNum} of ${total}`, {
        x: PAGE_WIDTH - MARGIN - 40, y: 26, size: 6.5, font: regular, color: MID,
    });
    page.drawText(`Registered Debt Counsellor. Registration number ${ZDM.ncrdc} | Member of Debt Counsellors Association of South Africa ${ZDM.dcasa}`, {
        x: MARGIN, y: 14, size: 5.5, font: regular, color: MID,
    });
}

// ---------------------------------------------------------------------------
// Signature line helper
// ---------------------------------------------------------------------------

function drawSignatureLine(page: PDFPage, label: string, x: number, y: number, width: number, regular: PDFFont): void {
    drawLine(page, x, y, x + width, y, 0.7);
    page.drawText(label, { x, y: y - 10, size: 7, font: regular, color: MID });
}

// ===========================================================================
// GENERATE STANDARD ZDM POA
// ===========================================================================

export async function generateStandardPoa(input: StandardPoaInput): Promise<Buffer> {
    logger.info('[POA] Generating Standard ZDM POA', { client: input.fullName });

    const pdf   = await PDFDocument.create();
    const bold  = await pdf.embedFont(StandardFonts.HelveticaBold);
    const reg   = await pdf.embedFont(StandardFonts.Helvetica);

    const pages: PDFPage[] = [];
    for (let i = 0; i < 3; i++) pages.push(pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]));

    // -------------------------------------------------------------------------
    // PAGE 1 — Principal Details + Powers
    // -------------------------------------------------------------------------
    {
        const page = pages[0]!;
        let y = drawLetterhead(page, bold, reg);

        // Title
        y -= 14;
        const title = 'POWER OF ATTORNEY';
        const titleW = bold.widthOfTextAtSize(title, 16);
        page.drawText(title, { x: (PAGE_WIDTH - titleW) / 2, y, size: 16, font: bold, color: NAVY });
        y -= 6;
        drawLine(page, (PAGE_WIDTH - 120) / 2, y, (PAGE_WIDTH + 120) / 2, y, 1);
        y -= 14;

        // Intro paragraph
        const intro = `I, the undersigned (the "Principal"), do hereby nominate, constitute and appoint ${ZDM.name} and its authorised representatives, including DC Credit Protect (Pty) Ltd (FSP No. 51550), underwritten by African Unity Life (Pty) Ltd (FSP No. 8447), as my true and lawful agents to act on my behalf in all matters set out herein.`;
        y = drawWrapped(page, intro, MARGIN, y, COL_WIDTH, reg, 8.5, DARK, 3);
        y -= 12;

        // SECTION 1 — Principal Details
        y = drawSectionHeader(page, '1.  PRINCIPAL DETAILS', y, bold);
        y -= 2;

        // Full name — full width
        y = drawField(page, 'FULL NAME & SURNAME', input.fullName, MARGIN, y, COL_WIDTH, reg, bold);
        y -= 1;

        // ID + DOB side by side
        const halfW = (COL_WIDTH - 2) / 2;
        const leftY  = drawField(page, 'IDENTITY NUMBER', input.idNumber, MARGIN, y, halfW, reg, bold);
        drawField(page, 'DATE OF BIRTH', input.dateOfBirth ?? '', MARGIN + halfW + 2, y, halfW, reg, bold);
        y = leftY;
        y -= 1;

        // Address — full width
        y = drawField(page, 'RESIDENTIAL ADDRESS', input.address, MARGIN, y, COL_WIDTH, reg, bold);
        y -= 1;

        // Phone + Email side by side
        const leftY2 = drawField(page, 'CONTACT NUMBER', input.phone, MARGIN, y, halfW, reg, bold);
        drawField(page, 'EMAIL ADDRESS', input.email, MARGIN + halfW + 2, y, halfW, reg, bold);
        y = leftY2;
        y -= 14;

        // SECTION 2 — Powers Granted
        y = drawSectionHeader(page, '2.  POWERS GRANTED TO THE AGENT', y, bold);
        y -= 4;

        const powers = [
            'Obtain credit data from any credit bureau; manage credit information; provide financial advice; lodge disputes and negotiate settlement amounts and/or payment arrangements with credit providers pertaining to clearing my credit report of all incorrect, irregular and/or unlawful listings.',
            'Disclose my credit report information to any third-party applicant to whom I have applied for finance.',
            'Appoint an attorney or legal professional to appear in court to rescind and/or challenge any judgment(s) obtained against me, and to proceed to the finalisation thereof.',
            'Claim damages from any third party resulting from incorrect listings or information on my credit report, including any personal damages I may have suffered.',
            'Obtain replacement copies of any and all active credit life insurance policies, including policy schedules and benefits summaries, held at any credit provider or insurer (via DC Credit Protect (Pty) Ltd, FSP No. 51550, underwritten by African Unity Life (Pty) Ltd, FSP No. 8447).',
            'Substitute and/or cancel any credit life insurance policy in my name with another policy of my choice, as permitted by s106(4)(a) read with s106(6) and Regulation 7 of the Credit Life Insurance Regulations.',
            'Perform any additional act reasonably required to give effect to the directions contained in this Power of Attorney.',
        ];

        for (let i = 0; i < powers.length; i++) {
            const numX = MARGIN;
            const textX = MARGIN + 16;
            const dotR = 5;
            // Circle bullet
            page.drawCircle({ x: numX + dotR, y: y - dotR, size: dotR, color: TEAL });
            page.drawText(String(i + 1), { x: numX + dotR - (i < 9 ? 2.5 : 4.5), y: y - dotR - 3, size: 7, font: bold, color: WHITE });
            const newY = drawWrapped(page, powers[i]!, textX, y, COL_WIDTH - 16, reg, 8, DARK, 3);
            y = newY - 5;
            if (y < 55) break; // safety
        }

        drawFooter(page, reg, 1, 3);
    }

    // -------------------------------------------------------------------------
    // PAGE 2 — Authorization + Transfer + Declaration
    // -------------------------------------------------------------------------
    {
        const page = pages[1]!;
        let y = drawLetterhead(page, bold, reg);

        // Sub-title
        y -= 14;
        const sub = 'AUTHORIZATION & TRANSFER REQUEST';
        const subW = bold.widthOfTextAtSize(sub, 13);
        page.drawText(sub, { x: (PAGE_WIDTH - subW) / 2, y, size: 13, font: bold, color: NAVY });
        y -= 6;
        drawLine(page, (PAGE_WIDTH - 120) / 2, y, (PAGE_WIDTH + 120) / 2, y, 1);
        y -= 14;

        // SECTION 3 — Credit Bureau Access
        y = drawSectionHeader(page, '3.  AUTHORIZATION — CREDIT BUREAU ACCESS', y, bold);
        y -= 6;
        const s3text = 'I consent that the Debt Counsellor and/or the Agent may obtain and update my credit records from any and all registered credit bureaus and from any other registers containing my credit information. I further consent that the Debt Counsellor, the firm and its associates may send me marketing and promotional materials.';
        y = drawWrapped(page, s3text, MARGIN, y, COL_WIDTH, reg, 8.5, DARK, 3);
        y -= 14;

        // SECTION 4 — Transfer
        y = drawSectionHeader(page, '4.  TRANSFER AUTHORIZATION — COMPLETE ONLY IF TRANSFERRING COUNSELLOR', y, bold);
        y -= 6;
        const s4text = 'I consent that the Debt Counsellor may request my debt review file from my current debt counsellor in order to transfer my file to Zenowethu Debt Management. Please complete the details of your current debt counsellor below:';
        y = drawWrapped(page, s4text, MARGIN, y, COL_WIDTH, reg, 8.5, DARK, 3);
        y -= 6;

        const isTransfer = input.isTransfer ?? false;
        y = drawField(page, 'CURRENT DEBT COUNSELLOR — FULL NAME', isTransfer ? (input.currentCounsellor ?? '') : '', MARGIN, y, COL_WIDTH, reg, bold);
        y -= 1;
        const halfW = (COL_WIDTH - 2) / 2;
        const leftY = drawField(page, 'NCRDC REGISTRATION NUMBER', isTransfer ? (input.currentNcrdc ?? '') : '', MARGIN, y, halfW, reg, bold);
        drawField(page, 'COUNSELLOR CONTACT NUMBER', isTransfer ? (input.currentCounsellorTel ?? '') : '', MARGIN + halfW + 2, y, halfW, reg, bold);
        y = leftY;
        y -= 4;

        // Note
        page.drawRectangle({ x: MARGIN, y: y - 20, width: COL_WIDTH, height: 20, color: rgb(0.96, 0.96, 0.96) });
        page.drawText('Note: Complete this section only if you are currently under debt review with another debt counsellor and wish to transfer your file to Zenowethu Debt Management.', {
            x: MARGIN + 6, y: y - 13, size: 7, font: reg, color: MID,
        });
        y -= 24;

        // SECTION 5 — Documents Checklist
        y = drawSectionHeader(page, '5.  REQUIRED DOCUMENTS CHECKLIST', y, bold);
        y -= 8;
        page.drawText('Please ensure the following certified documents are attached to this form:', { x: MARGIN, y, size: 8.5, font: reg, color: DARK });
        y -= 12;

        const docs = [
            'Valid Proof of Residential Address (not older than 3 months)',
            'Certified copy of Identity Document (ID / Smart Card / Passport)',
        ];
        for (const doc of docs) {
            // Checkbox square
            page.drawRectangle({ x: MARGIN, y: y - 8, width: 9, height: 9, borderColor: MID, borderWidth: 0.8 });
            page.drawText(doc, { x: MARGIN + 14, y: y - 6, size: 8.5, font: reg, color: DARK });
            y -= 14;
        }
        y -= 8;

        // SECTION 6 — Declaration
        y = drawSectionHeader(page, '6.  DECLARATION', y, bold);
        y -= 8;
        page.drawText('I, the Principal, hereby confirm that:', { x: MARGIN, y, size: 8.5, font: reg, color: DARK });
        y -= 12;

        const declarations = [
            'This Power of Attorney was signed by me personally and not by any other person.',
            'I am signing freely, voluntarily and not under any duress or undue influence.',
            'I understand the full extent of the powers I am granting to the Agent herein.',
            'Where applicable, I consent to the transfer of my debt review file as detailed in Section 4.',
        ];
        for (const d of declarations) {
            page.drawRectangle({ x: MARGIN, y: y - 8, width: 9, height: 9, borderColor: MID, borderWidth: 0.8 });
            page.drawText(d, { x: MARGIN + 14, y: y - 6, size: 8.5, font: reg, color: DARK });
            y -= 14;
        }

        drawFooter(page, reg, 2, 3);
    }

    // -------------------------------------------------------------------------
    // PAGE 3 — Signatures
    // -------------------------------------------------------------------------
    {
        const page = pages[2]!;
        let y = drawLetterhead(page, bold, reg);

        // Title
        y -= 16;
        const title = 'SIGNATURES';
        const titleW = bold.widthOfTextAtSize(title, 15);
        page.drawText(title, { x: (PAGE_WIDTH - titleW) / 2, y, size: 15, font: bold, color: NAVY });
        y -= 6;
        drawLine(page, (PAGE_WIDTH - 100) / 2, y, (PAGE_WIDTH + 100) / 2, y, 1);
        y -= 14;

        // Intro
        const intro = 'By signing below, the Principal confirms full understanding and acceptance of this Power of Attorney, the Authorization to Obtain Confidential Information from Credit Bureaus, and (where applicable) the Transfer Authorization contained in this document.';
        y = drawWrapped(page, intro, MARGIN, y, COL_WIDTH, reg, 8.5, DARK, 3);
        y -= 14;

        // Signed at + Date side by side
        const halfW = (COL_WIDTH - 2) / 2;
        const leftY = drawField(page, 'SIGNED AT (CITY / TOWN)', input.signedAtCity ?? '', MARGIN, y, halfW, reg, bold);
        drawField(page, 'DATE', input.signedDate ?? '', MARGIN + halfW + 2, y, halfW, reg, bold);
        y = leftY;
        y -= 20;

        drawLine(page, MARGIN, y, PAGE_WIDTH - MARGIN, y, 0.5);
        y -= 14;

        // Principal Signature box
        drawRect(page, MARGIN, y - 60, COL_WIDTH, 62, rgb(0.97, 0.98, 1.0));
        page.drawText('PRINCIPAL SIGNATURE', { x: MARGIN + 6, y: y - 10, size: 8, font: bold, color: NAVY });
        page.drawText('I have read and understood this entire document', { x: PAGE_WIDTH - MARGIN - 175, y: y - 10, size: 7, font: reg, color: MID });
        drawLine(page, MARGIN + 6, y - 42, MARGIN + COL_WIDTH / 2 - 10, y - 42, 0.7);
        page.drawText('Signature of Principal', { x: MARGIN + 6, y: y - 51, size: 7, font: reg, color: MID });
        page.drawText(`ID No: ${input.idNumber}`, { x: MARGIN + COL_WIDTH / 2 + 10, y: y - 51, size: 7.5, font: bold, color: DARK });
        y -= 74;

        drawLine(page, MARGIN, y, PAGE_WIDTH - MARGIN, y, 0.5);
        y -= 14;

        // Witness boxes side by side
        const wBoxW = (COL_WIDTH - 4) / 2;
        for (let i = 0; i < 2; i++) {
            const wx = MARGIN + i * (wBoxW + 4);
            drawRect(page, wx, y - 52, wBoxW, 54, rgb(0.97, 0.98, 0.97));
            page.drawText(`WITNESS ${i + 1}`, { x: wx + 6, y: y - 10, size: 8, font: bold, color: NAVY });
            drawLine(page, wx + 6, y - 32, wx + wBoxW - 10, y - 32, 0.7);
            page.drawText('Signature', { x: wx + 6, y: y - 41, size: 7, font: reg, color: MID });
            drawLine(page, wx + wBoxW / 2 + 6, y - 32, wx + wBoxW - 10, y - 32, 0); // invisible — space
            page.drawText('Date (DD/MM/YYYY)', { x: wx + wBoxW - 80, y: y - 41, size: 7, font: reg, color: MID });
        }
        y -= 66;

        drawLine(page, MARGIN, y, PAGE_WIDTH - MARGIN, y, 0.5);
        y -= 14;

        // Commissioner of Oaths
        drawRect(page, MARGIN, y - 48, COL_WIDTH, 50, rgb(0.98, 0.98, 0.98));
        page.drawText('FOR OFFICE USE ONLY — COMMISSIONER OF OATHS (if required)', { x: MARGIN + 6, y: y - 10, size: 8, font: bold, color: DARK });
        drawLine(page, MARGIN + 6, y - 32, MARGIN + COL_WIDTH / 2 - 10, y - 32, 0.7);
        page.drawText('Signature & Stamp of Commissioner', { x: MARGIN + 6, y: y - 41, size: 7, font: reg, color: MID });
        drawLine(page, MARGIN + COL_WIDTH / 2 + 10, y - 32, PAGE_WIDTH - MARGIN - 6, y - 32, 0.7);
        page.drawText('Date', { x: MARGIN + COL_WIDTH / 2 + 10, y: y - 41, size: 7, font: reg, color: MID });

        drawFooter(page, reg, 3, 3);
    }

    const bytes = await pdf.save();
    logger.info('[POA] Standard ZDM POA generated successfully');
    return Buffer.from(bytes);
}

// ===========================================================================
// GENERATE WESBANK POA
// ===========================================================================

export async function generateWesbankPoa(input: WesbankPoaInput): Promise<Buffer> {
    logger.info('[POA] Generating Wesbank POA', { client: input.clientFullName, agent: input.agentFullName });

    const pdf  = await PDFDocument.create();
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const reg  = await pdf.embedFont(StandardFonts.Helvetica);

    const pages: PDFPage[] = [];
    for (let i = 0; i < 2; i++) pages.push(pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]));

    // -------------------------------------------------------------------------
    // PAGE 1 — Wesbank POA
    // -------------------------------------------------------------------------
    {
        const page = pages[0]!;
        let y = drawLetterhead(page, bold, reg);

        y -= 14;
        const title = 'POWER OF ATTORNEY';
        const titleW = bold.widthOfTextAtSize(title, 16);
        page.drawText(title, { x: (PAGE_WIDTH - titleW) / 2, y, size: 16, font: bold, color: NAVY });
        y -= 6;
        drawLine(page, (PAGE_WIDTH - 120) / 2, y, (PAGE_WIDTH + 120) / 2, y, 1);
        y -= 14;

        // Intro
        const intro = `This Power of Attorney (the "Agreement") is made BETWEEN: ${ZDM.name} a Company managed by a sole director ${ZDM.director} Id No: ${ZDM.directorId} the company is registered under the laws of the Republic of South Africa, with registration number ${ZDM.regNo}, and includes any exclusive Legal Practice or Legal Representative, subsidiary and or holding company having its registered head office at ${ZDM.address}.`;
        y = drawWrapped(page, intro, MARGIN, y, COL_WIDTH, reg, 8.5, DARK, 3);
        y -= 16;

        // Principal section label
        y = drawSectionHeader(page, 'PRINCIPAL (GRANTOR)', y, bold);
        y -= 4;

        const fullW = COL_WIDTH;
        const halfW = (COL_WIDTH - 2) / 2;

        y = drawField(page, 'FULL NAME AND SURNAME', input.clientFullName, MARGIN, y, fullW, reg, bold);
        y -= 1;
        y = drawField(page, 'IDENTITY NUMBER', input.clientIdNumber, MARGIN, y, fullW, reg, bold);
        y -= 1;
        y = drawField(page, 'RESIDING AT', input.clientAddress, MARGIN, y, fullW, reg, bold);
        y -= 16;

        // Agent section
        y = drawSectionHeader(page, 'AUTHORISED AGENT', y, bold);
        y -= 6;

        page.drawText('HEREBY APPOINT :', { x: MARGIN, y, size: 9, font: bold, color: DARK });
        y -= 14;

        y = drawField(page, 'AUTHORISED AGENT', input.agentFullName, MARGIN, y, fullW, reg, bold);
        y -= 1;
        y = drawField(page, 'AUTHORISED AGENT ID', input.agentIdNumber, MARGIN, y, fullW, reg, bold);
        y -= 1;
        y = drawField(page, 'RESIDING AT', input.agentAddress, MARGIN, y, fullW, reg, bold);
        y -= 16;

        // Powers
        y = drawSectionHeader(page, 'POWERS GRANTED', y, bold);
        y -= 8;

        const mandate = 'As my true and lawful agent to act on my behalf in all matters relating to my account and dealings with Wesbank, including but not limited to accessing account information, making inquiries, managing payments, and any other related actions.';
        y = drawWrapped(page, mandate, MARGIN, y, COL_WIDTH, reg, 8.5, DARK, 3);
        y -= 8;

        const authority = 'This Power of Attorney grants my authorised agent full authority to act on my behalf in the aforementioned capacities, including signing any necessary documents and making decisions related to my account with Wesbank.';
        y = drawWrapped(page, authority, MARGIN, y, COL_WIDTH, reg, 8.5, DARK, 3);
        y -= 20;

        // Signatures section
        y = drawSectionHeader(page, 'SIGNATURES', y, bold);
        y -= 10;

        // Signed at + date
        const signedAt   = input.signedAtCity ?? 'MABOPANE';
        const signedDate = input.signedDate ?? '________';
        const sigLine = `Signed at ${signedAt}  on the ________  day of ________  2025.`;
        page.drawText(sigLine, { x: MARGIN, y, size: 9, font: reg, color: DARK });
        y -= 24;

        // Principal signature
        page.drawText('Signature of principal (Grantor)', { x: MARGIN, y, size: 8, font: bold, color: NAVY });
        y -= 32;
        drawLine(page, MARGIN, y, MARGIN + 180, y, 0.8);
        y -= 10;
        page.drawText('Full name and Surname', { x: MARGIN, y, size: 7, font: reg, color: MID });
        y -= 10;
        page.drawText(input.clientFullName, { x: MARGIN, y, size: 8.5, font: bold, color: DARK });
        y -= 28;

        // Agent signature
        page.drawText('Signature of Authorised Agent', { x: MARGIN, y, size: 8, font: bold, color: NAVY });
        y -= 32;
        drawLine(page, MARGIN, y, MARGIN + 180, y, 0.8);
        y -= 10;
        page.drawText('Full name of Authorised Agent', { x: MARGIN, y, size: 7, font: reg, color: MID });
        y -= 10;
        page.drawText(input.agentFullName, { x: MARGIN, y, size: 8.5, font: bold, color: DARK });

        drawFooter(page, reg, 1, 2);
    }

    // -------------------------------------------------------------------------
    // PAGE 2 — Witnesses
    // -------------------------------------------------------------------------
    {
        const page = pages[1]!;
        let y = drawLetterhead(page, bold, reg);

        y -= 16;
        y = drawSectionHeader(page, 'WITNESSES', y, bold);
        y -= 8;

        const witnessNote = 'We, the undersigned, hereby confirm that the principal and authorized agent signed this power of attorney in our presence and in the presence of each other.';
        y = drawWrapped(page, witnessNote, MARGIN, y, COL_WIDTH, reg, 8.5, DARK, 3);
        y -= 20;

        for (let i = 1; i <= 2; i++) {
            page.drawText(`Witness ${i} :`, { x: MARGIN, y, size: 9, font: bold, color: NAVY });
            y -= 16;

            const fields: [string, string][] = [
                ['Full Names and Surname', ''],
                ['Signature', ''],
                ['Date signed', ''],
            ];

            for (const [label, _val] of fields) {
                page.drawText(`${label}`, { x: MARGIN, y, size: 8, font: reg, color: MID });
                page.drawText(':', { x: MARGIN + 130, y, size: 8, font: reg, color: DARK });
                drawLine(page, MARGIN + 140, y, PAGE_WIDTH - MARGIN, y, 0.6);
                y -= 20;
            }
            y -= 14;
        }

        drawFooter(page, reg, 2, 2);
    }

    const bytes = await pdf.save();
    logger.info('[POA] Wesbank POA generated successfully');
    return Buffer.from(bytes);
}
