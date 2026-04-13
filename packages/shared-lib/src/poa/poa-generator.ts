/**
 * POA Generator — builds pre-filled Power of Attorney PDFs from scratch,
 * using the Zenowethu branded letterhead as the background on every page.
 *
 * Coordinate system: PDF points, origin = bottom-left of page.
 * A4: 595.28 × 841.89 pt.
 *
 * Content area (below header, above footer/pre-printed area): y = 148–668
 */
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StandardPoaInput {
    fullName:    string;
    idNumber:    string;
    dateOfBirth: string;   // DD/MM/YYYY
    address:     string;
    phone:       string;
    email:       string;
    signedCity?: string;
    signedDate?: string;   // DD/MM/YYYY — pre-fill today's date
    // Section 4 — Transfer Authorization (pre-filled when service = Debt Review Flag Removal)
    dcName?:    string;
    dcNcrdcNo?: string;
    dcPhone?:   string;
}

export interface WesbankPoaInput {
    clientFullName: string;
    clientIdNumber: string;
    clientAddress:  string;
    agentFullName:  string;
    agentIdNumber:  string;
    agentAddress:   string;
    signedAtCity?:  string;
    signedDate?:    string;
}

// ─── Page / colour constants ──────────────────────────────────────────────────

const PW     = 595.28;
const PH     = 841.89;
const ML     = 55;          // left margin
const MR     = 540;         // right edge
const CW     = MR - ML;    // content width = 485 pt

const NAVY   = rgb(0.05, 0.22, 0.44);
const ORANGE = rgb(0.85, 0.44, 0.10);
const WHITE  = rgb(1, 1, 1);
const BLACK  = rgb(0.05, 0.05, 0.05);
const DGRAY  = rgb(0.40, 0.40, 0.40);
const LGRAY  = rgb(0.80, 0.80, 0.80);
const BGRAY  = rgb(0.96, 0.96, 0.97);

// ─── Letterhead loader ────────────────────────────────────────────────────────

async function loadLetterhead(): Promise<Uint8Array> {
    const candidates = [
        join(process.cwd(), 'apps', 'cases', 'public', 'templates', 'poa', 'Letterhead.pdf'),
        join(process.cwd(), 'public', 'templates', 'poa', 'Letterhead.pdf'),
        '/app/apps/cases/public/templates/poa/Letterhead.pdf',
        '/app/public/templates/poa/Letterhead.pdf',
    ];
    for (const p of candidates) {
        if (existsSync(p)) return readFile(p);
    }
    throw new Error(`Letterhead not found. Searched:\n${candidates.join('\n')}`);
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────

/** Word-wrap text to fit maxW, returns array of lines. */
function wrapLines(text: string, font: PDFFont, size: number, maxW: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) <= maxW) {
            line = test;
        } else {
            if (line) lines.push(line);
            line = word;
        }
    }
    if (line) lines.push(line);
    return lines;
}

/**
 * Draw wrapped text starting at (x, startY), moving DOWN.
 * Returns the Y coordinate below the last line drawn.
 */
function drawWrapped(
    page: PDFPage,
    text: string,
    font: PDFFont,
    size: number,
    x: number,
    startY: number,
    maxW: number,
    lineH = size * 1.4,
    color = BLACK,
): number {
    const lines = wrapLines(text, font, size, maxW);
    let y = startY;
    for (const line of lines) {
        page.drawText(line, { x, y, size, font, color });
        y -= lineH;
    }
    return y;
}

/** Draw text horizontally centred in the content column. */
function drawCentered(page: PDFPage, text: string, font: PDFFont, size: number, y: number, color = BLACK) {
    const tw = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: ML + (CW - tw) / 2, y, size, font, color });
}

/**
 * Draw a navy section-header box with white bold text.
 * Returns Y just below the box (ready for next element).
 */
function drawSectionHeader(page: PDFPage, text: string, bold: PDFFont, y: number): number {
    const boxH = 20;
    page.drawRectangle({ x: ML, y: y - boxH, width: CW, height: boxH, color: NAVY });
    page.drawText(text, { x: ML + 10, y: y - 14, size: 10, font: bold, color: WHITE });
    return y - boxH - 6;   // 6 pt gap below box
}

/**
 * Draw a labelled field box (gray background, label small/gray, value bold/black).
 * Returns Y below the box.
 */
function drawField(
    page: PDFPage,
    label: string,
    value: string,
    regular: PDFFont,
    bold: PDFFont,
    x: number,
    y: number,
    w: number,
): number {
    const boxH = 30;
    page.drawRectangle({ x, y: y - boxH, width: w, height: boxH, color: BGRAY, borderColor: LGRAY, borderWidth: 0.5 });
    page.drawText(label, { x: x + 5, y: y - 10, size: 7, font: regular, color: DGRAY });
    if (value) page.drawText(value, { x: x + 5, y: y - 23, size: 10, font: bold, color: BLACK });
    return y - boxH - 3;
}

/** Draw two fields side by side. Returns Y below the boxes. */
function drawFieldPair(
    page: PDFPage,
    label1: string, value1: string,
    label2: string, value2: string,
    regular: PDFFont, bold: PDFFont,
    y: number,
    gap = 6,
): number {
    const halfW = (CW - gap) / 2;
    drawField(page, label1, value1, regular, bold, ML, y, halfW);
    drawField(page, label2, value2, regular, bold, ML + halfW + gap, y, halfW);
    return y - 30 - 3;
}

/** Draw an empty checkbox square. */
function drawCheckbox(page: PDFPage, x: number, y: number) {
    page.drawRectangle({ x, y: y - 9, width: 9, height: 9, borderColor: DGRAY, borderWidth: 0.7, color: WHITE });
}

/**
 * Cover the letterhead's pre-printed "DATED AT" and "SIGNATURE" lines.
 * They sit between the footer logo (y≈0–58) and the content area.
 * We paint white over them on every page, keeping only the footer logo strip.
 */
function coverPreprinted(page: PDFPage) {
    // The letterhead's pre-printed DATED AT and SIGNATURE sit somewhere in the
    // bottom half of the page. We paint a generous white strip from just above
    // the footer logo (y=60) up to y=440 to guarantee they are fully hidden.
    page.drawRectangle({ x: 20, y: 60, width: PW - 40, height: 380, color: WHITE });
}

// ─── Standard ZDM POA ─────────────────────────────────────────────────────────
//
// 3 pages:
//   Page 1 — POWER OF ATTORNEY     (Principal Details + Powers)
//   Page 2 — AUTHORIZATION         (Credit Bureau, Transfer, Checklist, Declaration)
//   Page 3 — SIGNATURES            (Signed-at, Principal sig, Witnesses, Commissioner)

export async function generateStandardPoa(input: StandardPoaInput): Promise<Buffer> {
    const lhBytes  = await loadLetterhead();
    const pdfDoc   = await PDFDocument.create();
    const [lh]     = await pdfDoc.embedPdf(lhBytes, [0]);

    const regular  = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold     = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const italic   = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    // ── Helper: add a page with letterhead background ────────────────────────
    const addPage = (): PDFPage => {
        const p = pdfDoc.addPage([PW, PH]);
        p.drawPage(lh, { x: 0, y: 0, width: PW, height: PH });
        return p;
    };

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 1 — POWER OF ATTORNEY
    // ════════════════════════════════════════════════════════════════════════
    const p1 = addPage();
    coverPreprinted(p1);

    // Title
    drawCentered(p1, 'POWER OF ATTORNEY', bold, 16, 648);
    p1.drawRectangle({ x: ML + CW / 2 - 30, y: 630, width: 60, height: 2, color: ORANGE });

    // Opening paragraph
    let y = 618;
    y = drawWrapped(
        p1,
        'I, the undersigned (the "Principal"), do hereby nominate, constitute and appoint Zenowethu Debt Management (PTY) LTD and its authorised representatives, including DC Credit Protect (Pty) Ltd (FSP No. 51550), underwritten by African Unity Life (Pty) Ltd (FSP No. 8447), as my true and lawful agents to act on my behalf in all matters set out herein.',
        regular, 10, ML, y, CW, 14,
    );

    // ── Section 1: PRINCIPAL DETAILS ────────────────────────────────────────
    y -= 6;
    y = drawSectionHeader(p1, '1.   PRINCIPAL DETAILS', bold, y);

    y = drawField(p1, 'FULL NAME & SURNAME', input.fullName, regular, bold, ML, y, CW);
    y = drawFieldPair(
        p1,
        'IDENTITY NUMBER', input.idNumber,
        'DATE OF BIRTH', input.dateOfBirth,
        regular, bold, y,
    );
    y = drawField(p1, 'RESIDENTIAL ADDRESS', input.address, regular, bold, ML, y, CW);
    y = drawFieldPair(
        p1,
        'CONTACT NUMBER', input.phone,
        'EMAIL ADDRESS', input.email,
        regular, bold, y,
    );

    // ── Section 2: POWERS GRANTED ────────────────────────────────────────────
    y -= 6;
    y = drawSectionHeader(p1, '2.   POWERS GRANTED TO THE AGENT', bold, y);
    y -= 6;

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
        // Numbered orange square — centre-aligned with the first text baseline
        const num = `${i + 1}`;
        p1.drawRectangle({ x: ML, y: y - 7, width: 14, height: 14, color: ORANGE });
        p1.drawText(num, { x: ML + (14 - bold.widthOfTextAtSize(num, 8)) / 2, y: y - 4, size: 8, font: bold, color: WHITE });
        // Power text
        const after = drawWrapped(p1, powers[i], regular, 9, ML + 18, y, CW - 18, 12);
        y = after - 5;
    }

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 2 — AUTHORIZATION & TRANSFER REQUEST
    // ════════════════════════════════════════════════════════════════════════
    const p2 = addPage();
    coverPreprinted(p2);

    drawCentered(p2, 'AUTHORIZATION & TRANSFER REQUEST', bold, 14, 624);
    p2.drawRectangle({ x: ML + CW / 2 - 40, y: 608, width: 80, height: 2, color: ORANGE });

    y = 596;

    // Section 3
    y = drawSectionHeader(p2, '3.   AUTHORIZATION — CREDIT BUREAU ACCESS', bold, y);
    y -= 6;
    y = drawWrapped(
        p2,
        'I consent that the Debt Counsellor and/or the Agent may obtain and update my credit records from any and all registered credit bureaus and from any other registers containing my credit information. I further consent that the Debt Counsellor, the firm and its associates may send me marketing and promotional materials.',
        regular, 10, ML, y, CW, 14,
    );

    // Section 4
    y -= 8;
    y = drawSectionHeader(p2, '4.   TRANSFER AUTHORIZATION — COMPLETE ONLY IF TRANSFERRING COUNSELLOR', bold, y);
    y -= 6;
    y = drawWrapped(
        p2,
        'I consent that the Debt Counsellor may request my debt review file from my current debt counsellor in order to transfer my file to Zenowethu Debt Management. Please complete the details of your current debt counsellor below:',
        regular, 10, ML, y, CW, 14,
    );
    y -= 4;
    y = drawField(p2, 'CURRENT DEBT COUNSELLOR — FULL NAME', input.dcName ?? '', regular, bold, ML, y, CW);
    y = drawFieldPair(p2, 'NCRDC REGISTRATION NUMBER', input.dcNcrdcNo ?? '', 'COUNSELLOR CONTACT NUMBER', input.dcPhone ?? '', regular, bold, y);

    // Note
    y -= 10;
    y = drawWrapped(
        p2,
        'Note: Complete this section only if you are currently under debt review with another debt counsellor and wish to transfer your file to Zenowethu Debt Management.',
        italic, 9, ML + 4, y, CW - 8, 13, DGRAY,
    );

    // Section 5
    y -= 10;
    y = drawSectionHeader(p2, '5.   REQUIRED DOCUMENTS CHECKLIST', bold, y);
    y -= 6;
    p2.drawText('Please ensure the following certified documents are attached to this form:', { x: ML, y, size: 10, font: regular, color: BLACK });
    y -= 16;

    const checklist = [
        'Valid Proof of Residential Address (not older than 3 months)',
        'Certified copy of Identity Document (ID / Smart Card / Passport)',
    ];
    for (const item of checklist) {
        drawCheckbox(p2, ML, y);
        p2.drawText(item, { x: ML + 14, y: y - 8, size: 10, font: regular, color: BLACK });
        y -= 20;
    }

    // Section 6
    y -= 8;
    y = drawSectionHeader(p2, '6.   DECLARATION', bold, y);
    y -= 6;
    p2.drawText('I, the Principal, hereby confirm that:', { x: ML, y, size: 10, font: regular, color: BLACK });
    y -= 16;

    const declarations = [
        'This Power of Attorney was signed by me personally and not by any other person.',
        'I am signing freely, voluntarily and not under any duress or undue influence.',
        'I understand the full extent of the powers I am granting to the Agent herein.',
        'Where applicable, I consent to the transfer of my debt review file as detailed in Section 4.',
    ];
    for (const item of declarations) {
        drawCheckbox(p2, ML, y);
        p2.drawText(item, { x: ML + 14, y: y - 8, size: 10, font: regular, color: BLACK });
        y -= 20;
    }

    // ── Single Signature Section (page 2 bottom) ─────────────────────────────
    y -= 10;
    y = drawFieldPair(
        p2,
        'SIGNED AT (CITY / TOWN)', input.signedCity ?? 'Pretoria',
        'DATE', input.signedDate ?? '',
        regular, bold, y,
    );

    y -= 8;
    const sigBoxH = 70;
    p2.drawRectangle({ x: ML, y: y - sigBoxH, width: CW, height: sigBoxH, color: BGRAY, borderColor: LGRAY, borderWidth: 0.5 });
    p2.drawRectangle({ x: ML, y: y - sigBoxH, width: CW, height: 18, color: NAVY });
    p2.drawText('PRINCIPAL SIGNATURE', { x: ML + 8, y: y - sigBoxH + 5, size: 10, font: bold, color: WHITE });
    p2.drawText('I have read and understood this entire document', {
        x: MR - italic.widthOfTextAtSize('I have read and understood this entire document', 8) - 5,
        y: y - sigBoxH + 5, size: 8, font: italic, color: ORANGE,
    });
    p2.drawLine({ start: { x: ML + 10, y: y - sigBoxH + 36 }, end: { x: ML + 240, y: y - sigBoxH + 36 }, thickness: 0.5, color: DGRAY });
    p2.drawText('Signature of Principal', { x: ML + 10, y: y - sigBoxH + 26, size: 8, font: regular, color: DGRAY });
    p2.drawText(`ID No: ${input.idNumber}`, { x: ML + 260, y: y - sigBoxH + 26, size: 8, font: regular, color: DGRAY });

    return Buffer.from(await pdfDoc.save());
}

// ─── Wesbank POA ──────────────────────────────────────────────────────────────
//
// 2 pages:
//   Page 1 — Main content (company intro, client/agent details, signatures)
//   Page 2 — Witness signatures

export async function generateWesbankPoa(input: WesbankPoaInput): Promise<Buffer> {
    const lhBytes = await loadLetterhead();
    const pdfDoc  = await PDFDocument.create();
    const [lh]    = await pdfDoc.embedPdf(lhBytes, [0]);

    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const addPage = (): PDFPage => {
        const p = pdfDoc.addPage([PW, PH]);
        p.drawPage(lh, { x: 0, y: 0, width: PW, height: PH });
        return p;
    };

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 1
    // ════════════════════════════════════════════════════════════════════════
    const p1 = addPage();
    coverPreprinted(p1);

    drawCentered(p1, 'POWER OF ATTORNEY', bold, 16, 648);
    p1.drawRectangle({ x: ML + CW / 2 - 30, y: 630, width: 60, height: 2, color: ORANGE });

    let y = 616;
    y = drawWrapped(
        p1,
        'This Power of Attorney (the "Agreement") is made BETWEEN: Zenowethu Debt Management (PTY) LTD, a company managed by a sole director Aaron Nzotho, ID No: 7809065687086, registered under the laws of the Republic of South Africa with registration number 2013/121120/07, having its registered head office at Suite 2, Second Floor, Central House, 17 Central Road, Mabopane, 0199.',
        regular, 10, ML, y, CW, 14,
    );

    y -= 10;
    y = drawSectionHeader(p1, 'CLIENT (GRANTOR) DETAILS', bold, y);
    y = drawField(p1, 'FULL NAME AND SURNAME', input.clientFullName, regular, bold, ML, y, CW);
    y = drawField(p1, 'IDENTITY NUMBER', input.clientIdNumber, regular, bold, ML, y, CW);
    y = drawField(p1, 'RESIDENTIAL ADDRESS', input.clientAddress, regular, bold, ML, y, CW);

    y -= 6;
    y = drawSectionHeader(p1, 'HEREBY APPOINT', bold, y);
    y = drawField(p1, 'AUTHORISED AGENT', input.agentFullName, regular, bold, ML, y, CW);
    y = drawField(p1, 'AUTHORISED AGENT ID NUMBER', input.agentIdNumber, regular, bold, ML, y, CW);
    y = drawField(p1, 'AGENT RESIDENTIAL ADDRESS', input.agentAddress, regular, bold, ML, y, CW);

    y -= 8;
    y = drawWrapped(
        p1,
        'As my true and lawful agent to act on my behalf in all matters relating to my account and dealings with Wesbank, including but not limited to accessing account information, making inquiries, managing payments, or any other related actions.',
        regular, 10, ML, y, CW, 14,
    );
    y -= 6;
    y = drawWrapped(
        p1,
        'This Power of Attorney grants my authorised agent full authority to act on my behalf in the aforementioned capacities, including signing any necessary documents and making decisions related to my account with Wesbank.',
        regular, 10, ML, y, CW, 14,
    );

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 2 — SIGNATURES + WITNESSES
    // ════════════════════════════════════════════════════════════════════════
    const p2 = addPage();
    coverPreprinted(p2);

    // ── SIGNATURES ───────────────────────────────────────────────────────────
    y = 700;
    y = drawSectionHeader(p2, 'SIGNATURES', bold, y);
    y -= 10;

    // Principal (Grantor) signature
    p2.drawText('Signature of Principal (Grantor)', { x: ML, y, size: 9, font: bold, color: NAVY });
    y -= 8;
    p2.drawLine({ start: { x: ML, y }, end: { x: ML + 220, y }, thickness: 0.5, color: DGRAY });
    y -= 20;
    p2.drawText(input.clientFullName, { x: ML + 2, y, size: 10, font: bold, color: BLACK });
    y -= 13;
    p2.drawText('Full Name and Surname', { x: ML, y, size: 8, font: regular, color: DGRAY });
    y -= 5;
    p2.drawLine({ start: { x: ML, y }, end: { x: ML + 220, y }, thickness: 0.5, color: LGRAY });
    y -= 24;

    // Agent signature
    p2.drawText('Signature of Authorised Agent', { x: ML, y, size: 9, font: bold, color: NAVY });
    y -= 8;
    p2.drawLine({ start: { x: ML, y }, end: { x: ML + 220, y }, thickness: 0.5, color: DGRAY });
    y -= 20;
    p2.drawText(input.agentFullName, { x: ML + 2, y, size: 10, font: bold, color: BLACK });
    y -= 13;
    p2.drawText('Full Name of Authorised Agent', { x: ML, y, size: 8, font: regular, color: DGRAY });
    y -= 5;
    p2.drawLine({ start: { x: ML, y }, end: { x: ML + 220, y }, thickness: 0.5, color: LGRAY });

    // ── WITNESSES ─────────────────────────────────────────────────────────────
    y -= 24;
    y = drawSectionHeader(p2, 'WITNESSES', bold, y);
    y -= 12;   // space between header and paragraph
    y = drawWrapped(
        p2,
        'We, the undersigned, hereby confirm that the principal and authorised agent signed this power of attorney in our presence and in the presence of each other.',
        regular, 10, ML, y, CW, 14,
    );

    for (let wi = 0; wi < 2; wi++) {
        const label = wi === 0 ? 'Witness 1 :' : 'Witness 2 :';
        y -= wi === 0 ? 28 : 24;
        p2.drawText(label, { x: ML, y, size: 11, font: bold, color: NAVY });
        y -= 18;
        p2.drawText('Full Names and Surname', { x: ML, y, size: 8, font: regular, color: DGRAY });
        y -= 5;
        p2.drawLine({ start: { x: ML, y }, end: { x: MR, y }, thickness: 0.5, color: LGRAY });
        y -= 18;
        p2.drawText('Signature', { x: ML, y, size: 8, font: regular, color: DGRAY });
        y -= 5;
        p2.drawLine({ start: { x: ML, y }, end: { x: MR, y }, thickness: 0.5, color: LGRAY });
        y -= 18;
        p2.drawText('Date signed', { x: ML, y, size: 8, font: regular, color: DGRAY });
        y -= 5;
        p2.drawLine({ start: { x: ML, y }, end: { x: MR, y }, thickness: 0.5, color: LGRAY });
    }

    return Buffer.from(await pdfDoc.save());
}
