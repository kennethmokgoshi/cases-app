import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage, PDFEmbeddedPage } from 'pdf-lib';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';

// ── Colours (match Form 19 / POA branding — navy / gold / clean) ───────────────
const PRIMARY_NAVY = rgb(0.05, 0.1,  0.25);   // Dark navy for section headers
const DARK_TEXT    = rgb(0.1,  0.1,  0.1);
const GRAY_LABEL   = rgb(0.35, 0.35, 0.35);   // Gray for labels
const MID_GRAY     = rgb(0.5,  0.5,  0.5);
const LIGHT_GRAY   = rgb(0.88, 0.88, 0.88);
const WHITE        = rgb(1,    1,    1);
const ACCENT_GOLD  = rgb(0.85, 0.55, 0.08);   // Gold underline accent (matches POA)
const HIGHLIGHT_YELLOW = rgb(1,    0.92, 0.4); // Selected-option highlight
const HEADER_BG    = rgb(0.92, 0.92, 0.92);   // Table header background

// ── Letterhead loader ─────────────────────────────────────────────────────────
async function tryLoadLetterhead(): Promise<Uint8Array | null> {
    const candidates = [
        ...(process.env.LETTERHEAD_PATH ? [process.env.LETTERHEAD_PATH] : []),
        join(process.cwd(), '..', '..', 'letterhead', 'Letter head Clean.pdf'),
        join(process.cwd(), 'public', 'templates', 'poa', 'Letterhead.pdf'),
        join(process.cwd(), 'apps', 'cases', 'public', 'templates', 'poa', 'Letterhead.pdf'),
        join(process.cwd(), 'public', 'templates', 'letterhead', 'Letter head Clean.pdf'),
        'C:\\Visual Studio Code\\06 March 2026\\letterhead\\Letter head Clean.pdf',
        '/app/apps/cases/public/templates/poa/Letterhead.pdf',
    ];
    for (const p of candidates) {
        if (existsSync(p)) {
            try { return await readFile(p); } catch {}
        }
    }
    return null;
}

export interface Form17WAccount {
    creditorName:       string;
    address:            string | null;
    phone:              string | null;
    email:              string | null;
    currentBalance:     number;
    instalment:         number | null;
    interestRate:       number | null;
}

/**
 * The four notice options prescribed by the Form 17.W template (Section
 * 71(2)(b)(i) of the National Credit Act). Exactly one is selected/highlighted
 * per notice — see REASON_OPTIONS below for the printed wording.
 */
export type Form17WReasonOption = 'A' | 'B' | 'C' | 'D';

export interface Form17WData {
    fileNumber:             string;
    withdrawalDate:         Date;
    // Consumer
    firstName:              string;
    lastName:                string;
    idNumber:               string;
    email:                  string | null;
    phone:                  string | null;
    address:                string | null;
    // Outstanding accounts notified via this withdrawal
    accounts:               Form17WAccount[];
    // DC details
    dcName:                 string;
    dcNcrdcNo:              string;
    dcAddress:              string;
    dcPhone:                string;
    dcEmail:                string;
    selectedOption:         Form17WReasonOption;
}

const REASON_OPTIONS: Record<Form17WReasonOption, string> = {
    A: 'The consumer has withdrawn from the debt review process prior to issuance of Form 17.2 and the credit bureaus have been updated accordingly via the NCR Debt Help System.',
    B: 'The debt counsellor has suspended provision of service due to non-cooperation by the consumer. The debt counsellor remains the debt counsellor on record.',
    C: 'The consumer has obtained a court order to rescind the debt review order. Credit bureaus have been updated via the NCR Debt Help System.',
    D: 'The consumer has obtained an order declaring the consumer no longer over indebted. Credit bureaus have been updated via the NCR Debt Help System.',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(val: string | null | undefined, fallback = '_______________'): string {
    return val?.trim() || fallback;
}

function zar(amount: number | null | undefined): string {
    if (amount == null) return 'R 0.00';
    return new Intl.NumberFormat('en-ZA', {
        style: 'currency', currency: 'ZAR', minimumFractionDigits: 2
    }).format(amount);
}

/** Word-wrap text to an array of lines that each fit within maxWidth. */
function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(testLine, size) > maxWidth && line) {
            lines.push(line);
            line = word;
        } else {
            line = testLine;
        }
    }
    if (line) lines.push(line);
    return lines.length > 0 ? lines : [''];
}

/** Extract date of birth from SA ID number (YYMMDD...) */
function extractDOB(idNumber: string): string {
    if (!idNumber || idNumber.length < 6) return '—';
    const yy = parseInt(idNumber.substring(0, 2), 10);
    const mm = idNumber.substring(2, 4);
    const dd = idNumber.substring(4, 6);
    const century = yy >= 0 && yy <= 30 ? '20' : '19';
    return `${dd}/${mm}/${century}${idNumber.substring(0, 2)}`;
}

/** Draw a dark navy section header bar with a gold numbered circle (matches Form 19 / POA style) */
function drawSectionHeader(page: PDFPage, num: string, text: string, y: number, bold: PDFFont, contentW: number, margin: number) {
    const barH = 22;
    page.drawRectangle({ x: margin, y: y - 6, width: contentW, height: barH, color: PRIMARY_NAVY });
    const circleX = margin + 14;
    const circleY = y + 3;
    page.drawCircle({ x: circleX, y: circleY, size: 8, color: ACCENT_GOLD });
    page.drawText(num, { x: circleX - (num.length > 1 ? 4.5 : 3), y: circleY - 3.5, size: 8, font: bold, color: WHITE });
    page.drawText(text, { x: margin + 28, y: y, size: 10, font: bold, color: WHITE });
    return y - barH - 4;
}

/** Draw a two-column bordered row (label above value in each cell) */
function drawTwoColRow(
    page: PDFPage,
    label1: string, value1: string,
    label2: string, value2: string,
    y: number, font: PDFFont, bold: PDFFont, margin: number, contentW: number,
): number {
    const rowH = 36;
    const boxY = y - rowH + 4;
    const halfW = contentW / 2;
    page.drawRectangle({ x: margin, y: boxY, width: halfW, height: rowH, borderWidth: 0.5, borderColor: LIGHT_GRAY });
    page.drawText(label1.toUpperCase(), { x: margin + 6, y: boxY + rowH - 12, size: 7, font, color: GRAY_LABEL });
    page.drawText(value1, { x: margin + 6, y: boxY + 6, size: 9, font: bold, color: DARK_TEXT });
    page.drawRectangle({ x: margin + halfW, y: boxY, width: halfW, height: rowH, borderWidth: 0.5, borderColor: LIGHT_GRAY });
    page.drawText(label2.toUpperCase(), { x: margin + halfW + 6, y: boxY + rowH - 12, size: 7, font, color: GRAY_LABEL });
    page.drawText(value2, { x: margin + halfW + 6, y: boxY + 6, size: 9, font: bold, color: DARK_TEXT });
    return y - rowH;
}

/** Draw a full-width bordered row with label above value */
function drawFullRow(
    page: PDFPage, label: string, value: string, y: number,
    font: PDFFont, bold: PDFFont, margin: number, contentW: number,
): number {
    const rowH = 36;
    const boxY = y - rowH + 4;
    page.drawRectangle({ x: margin, y: boxY, width: contentW, height: rowH, borderWidth: 0.5, borderColor: LIGHT_GRAY });
    page.drawText(label.toUpperCase(), { x: margin + 6, y: boxY + rowH - 12, size: 7, font, color: GRAY_LABEL });
    page.drawText(value, { x: margin + 6, y: boxY + 6, size: 9, font: bold, color: DARK_TEXT });
    return y - rowH;
}

function drawWrapped(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color: ReturnType<typeof rgb>, margin: number, contentW: number, lineHeight = 12): number {
    const words = text.split(' ');
    let line = '';
    for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(testLine, size) > contentW) {
            page.drawText(line, { x: margin, y, size, font, color });
            y -= lineHeight;
            line = word;
        } else {
            line = testLine;
        }
    }
    if (line) {
        page.drawText(line, { x: margin, y, size, font, color });
        y -= lineHeight;
    }
    return y;
}

/** Draws the "Creditors Notified" table header row. Returns the new y. */
function drawCreditorTableHeader(
    page: PDFPage, y: number, bold: PDFFont, margin: number,
    colX: { creditor: number; address: number; contact: number; details: number }, contentW: number,
): number {
    const headerH = 16;
    page.drawRectangle({ x: margin, y: y - headerH + 4, width: contentW, height: headerH, color: HEADER_BG, borderWidth: 0.5, borderColor: LIGHT_GRAY });
    page.drawText('Creditor', { x: colX.creditor + 4, y: y - 10, size: 7, font: bold, color: PRIMARY_NAVY });
    page.drawText('Address', { x: colX.address + 4, y: y - 10, size: 7, font: bold, color: PRIMARY_NAVY });
    page.drawText('Contact', { x: colX.contact + 4, y: y - 10, size: 7, font: bold, color: PRIMARY_NAVY });
    page.drawText('Account Details', { x: colX.details + 4, y: y - 10, size: 7, font: bold, color: PRIMARY_NAVY });
    return y - headerH;
}

/** Draws a single creditor row with wrapped, variable-height cells. Returns the new y. */
function drawCreditorRow(
    page: PDFPage, account: Form17WAccount, y: number, font: PDFFont, bold: PDFFont, margin: number,
    colX: { creditor: number; address: number; contact: number; details: number }, colW: { creditor: number; address: number; contact: number; details: number }, contentW: number,
): number {
    const cellPad = 4;
    const lineH = 8.5;
    const creditorLines = wrapLines(account.creditorName, bold, 7, colW.creditor - cellPad * 2);
    const addressLines  = wrapLines(fmt(account.address, '—'), font, 6.5, colW.address - cellPad * 2);
    const contactLines  = [
        `Tel: ${fmt(account.phone, '—')}`,
        'Fax: —',
        `E-Mail: ${fmt(account.email, '—')}`,
    ];
    const detailLines = [
        `Current Balance: ${zar(account.currentBalance)}`,
        `Instalment: ${zar(account.instalment)}`,
        `Interest Rate: ${account.interestRate != null ? account.interestRate.toFixed(2) + '%' : '—'}`,
    ];

    const maxLines = Math.max(creditorLines.length, addressLines.length, contactLines.length, detailLines.length);
    const rowH = maxLines * lineH + cellPad * 2;
    const boxY = y - rowH;

    page.drawRectangle({ x: margin, y: boxY, width: contentW, height: rowH, borderWidth: 0.5, borderColor: LIGHT_GRAY });
    page.drawLine({ start: { x: colX.address, y: boxY }, end: { x: colX.address, y: boxY + rowH }, thickness: 0.5, color: LIGHT_GRAY });
    page.drawLine({ start: { x: colX.contact, y: boxY }, end: { x: colX.contact, y: boxY + rowH }, thickness: 0.5, color: LIGHT_GRAY });
    page.drawLine({ start: { x: colX.details, y: boxY }, end: { x: colX.details, y: boxY + rowH }, thickness: 0.5, color: LIGHT_GRAY });

    const topTextY = boxY + rowH - cellPad - 6;
    creditorLines.forEach((l, i) => page.drawText(l, { x: colX.creditor + cellPad, y: topTextY - i * lineH, size: 7,   font: bold, color: DARK_TEXT }));
    addressLines.forEach((l, i)  => page.drawText(l, { x: colX.address  + cellPad, y: topTextY - i * lineH, size: 6.5, font,       color: DARK_TEXT }));
    contactLines.forEach((l, i)  => page.drawText(l, { x: colX.contact  + cellPad, y: topTextY - i * lineH, size: 6.5, font,       color: DARK_TEXT }));
    detailLines.forEach((l, i)   => page.drawText(l, { x: colX.details  + cellPad, y: topTextY - i * lineH, size: 6.5, font,       color: DARK_TEXT }));

    return boxY;
}

// ── Main generator ────────────────────────────────────────────────────────────
export async function generateForm17W(data: Form17WData): Promise<Uint8Array> {
    const doc  = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const PAGE_W = 595;
    const PAGE_H = 842;
    const MARGIN = 50;
    const CONTENT_W = PAGE_W - MARGIN * 2;

    // Try embedding real Zenowethu Debt Management letterhead
    const lhBytes = await tryLoadLetterhead();
    let letterhead: PDFEmbeddedPage | null = null;
    if (lhBytes) {
        try {
            const [embedded] = await doc.embedPdf(lhBytes, [0]);
            letterhead = embedded;
        } catch {}
    }

    const createNewPage = () => {
        const p = doc.addPage([PAGE_W, PAGE_H]);
        if (letterhead) {
            p.drawPage(letterhead, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
        }
        return p;
    };

    let page = createNewPage();
    let y = PAGE_H - 130; // Start below the letterhead logo area

    const ensureSpace = (needed: number) => {
        if (y - needed < 70) {
            page = createNewPage();
            y = PAGE_H - 130;
        }
    };

    // ── TITLE (centered, matches Form 19) ────────────────────────────────────
    const title = 'WITHDRAWAL FROM DEBT REVIEW';
    const titleW = bold.widthOfTextAtSize(title, 16);
    page.drawText(title, { x: (PAGE_W - titleW) / 2, y, size: 16, font: bold, color: PRIMARY_NAVY });
    y -= 10;

    const accentW = 40;
    page.drawRectangle({ x: (PAGE_W - accentW) / 2, y, width: accentW, height: 3, color: ACCENT_GOLD });
    y -= 10;

    const subtitle = 'In terms of section 71(2)(b)(i) of the National Credit Act 34 of 2005';
    const subtitleW = font.widthOfTextAtSize(subtitle, 8.5);
    page.drawText(subtitle, { x: (PAGE_W - subtitleW) / 2, y, size: 8.5, font, color: MID_GRAY });
    y -= 18;

    // File number & date
    const withdrawalDate = data.withdrawalDate.toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
    const fileNoStr = `File No: ${data.fileNumber}`;
    const dateStr = `Date of Issue: ${withdrawalDate}`;
    page.drawText(fileNoStr, { x: MARGIN, y, size: 8, font, color: MID_GRAY });
    const dateW = font.widthOfTextAtSize(dateStr, 8);
    page.drawText(dateStr, { x: PAGE_W - MARGIN - dateW, y, size: 8, font, color: MID_GRAY });
    y -= 14;

    // ── TO: NOTE ──────────────────────────────────────────────────────────────
    const toNote = 'TO: (An individually addressed notification must be sent to the credit department of each credit provider listed in the application for debt review)';
    y = drawWrapped(page, toNote, y, bold, 8, DARK_TEXT, MARGIN, CONTENT_W);
    y -= 6;

    // ── SECTION 1 — CREDITORS NOTIFIED ───────────────────────────────────────
    y = drawSectionHeader(page, '1', 'CREDITORS NOTIFIED', y, bold, CONTENT_W, MARGIN);
    y -= 4;

    const colW = { creditor: 90, address: 140, contact: 130, details: CONTENT_W - 90 - 140 - 130 };
    const colX = {
        creditor: MARGIN,
        address:  MARGIN + colW.creditor,
        contact:  MARGIN + colW.creditor + colW.address,
        details:  MARGIN + colW.creditor + colW.address + colW.contact,
    };

    y = drawCreditorTableHeader(page, y, bold, MARGIN, colX, CONTENT_W);

    if (data.accounts.length === 0) {
        const rowH = 18;
        page.drawRectangle({ x: MARGIN, y: y - rowH, width: CONTENT_W, height: rowH, borderWidth: 0.5, borderColor: LIGHT_GRAY });
        page.drawText('No outstanding accounts — all obligations have been fully satisfied.', { x: MARGIN + 4, y: y - 12, size: 7.5, font, color: MID_GRAY });
        y -= rowH;
    } else {
        for (const account of data.accounts) {
            // Rough worst-case row height for the page-break check (refined inside drawCreditorRow).
            ensureSpace(60);
            y = drawCreditorRow(page, account, y, font, bold, MARGIN, colX, colW, CONTENT_W);
        }
    }
    y -= 14;

    // ── SECTION 2 — DEBT COUNSELLOR DETAILS ──────────────────────────────────
    ensureSpace(160);
    y = drawSectionHeader(page, '2', 'DEBT COUNSELLOR DETAILS', y, bold, CONTENT_W, MARGIN);
    y -= 4;

    y = drawFullRow(page, 'Trading Name', 'Zenowethu Debt Management (Pty) Ltd', y, font, bold, MARGIN, CONTENT_W);
    y = drawTwoColRow(page, 'NCRDC Number', fmt(data.dcNcrdcNo), 'Debt Counsellor Name', fmt(data.dcName), y, font, bold, MARGIN, CONTENT_W);
    y = drawTwoColRow(page, 'Contact Number', fmt(data.dcPhone), 'Email Address', fmt(data.dcEmail), y, font, bold, MARGIN, CONTENT_W);
    y = drawFullRow(page, 'Physical Address', fmt(data.dcAddress), y, font, bold, MARGIN, CONTENT_W);
    y -= 10;

    // ── SECTION 3 — CONSUMER DETAILS ─────────────────────────────────────────
    ensureSpace(160);
    y = drawSectionHeader(page, '3', 'CONSUMER DETAILS', y, bold, CONTENT_W, MARGIN);
    y -= 4;

    const fullName = `${data.firstName} ${data.lastName}`;
    y = drawFullRow(page, 'Full Name', fmt(fullName), y, font, bold, MARGIN, CONTENT_W);
    y = drawTwoColRow(page, 'SA Identity Number', fmt(data.idNumber), 'Date of Birth', extractDOB(data.idNumber), y, font, bold, MARGIN, CONTENT_W);
    y = drawFullRow(page, 'Residential Address', fmt(data.address, '—'), y, font, bold, MARGIN, CONTENT_W);
    y = drawTwoColRow(page, 'Cell / Telephone', fmt(data.phone), 'Email Address', fmt(data.email), y, font, bold, MARGIN, CONTENT_W);
    y -= 10;

    // ── SECTION 4 — REASON FOR WITHDRAWAL ────────────────────────────────────
    ensureSpace(140);
    y = drawSectionHeader(page, '4', 'REASON FOR WITHDRAWAL', y, bold, CONTENT_W, MARGIN);
    y -= 6;
    page.drawText('This notice serves to advise you that: (select the appropriate option)', { x: MARGIN, y, size: 7.5, font, color: MID_GRAY });
    y -= 14;

    const optionLetters: Form17WReasonOption[] = ['A', 'B', 'C', 'D'];
    for (const letter of optionLetters) {
        ensureSpace(40);
        const optText = `${letter})  ${REASON_OPTIONS[letter]}`;
        // Wrap narrower than the highlight box (CONTENT_W) so every wrapped line —
        // including the indented continuation lines — sits fully inside the highlight.
        const lines = wrapLines(optText, font, 8, CONTENT_W - 40);
        const blockH = lines.length * 11 + 4;

        if (letter === data.selectedOption) {
            page.drawRectangle({ x: MARGIN - 2, y: y - blockH + 8, width: CONTENT_W + 4, height: blockH, color: HIGHLIGHT_YELLOW });
        }
        lines.forEach((l, i) => {
            page.drawText(l, { x: MARGIN + (i === 0 ? 0 : 14), y: y - i * 11, size: 8, font: letter === data.selectedOption ? bold : font, color: DARK_TEXT });
        });
        y -= blockH;
    }
    y -= 10;

    // ── SECTION 5 — DEBT COUNSELLOR ACCEPTANCE ───────────────────────────────
    ensureSpace(150);
    y = drawSectionHeader(page, '5', 'DEBT COUNSELLOR ACCEPTANCE', y, bold, CONTENT_W, MARGIN);
    y -= 16;

    page.drawText('Signature:', { x: MARGIN, y, size: 8, font: bold, color: DARK_TEXT });
    y -= 6;
    const signatureLineY = y;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 200, y }, thickness: 0.8, color: DARK_TEXT });
    page.drawLine({ start: { x: MARGIN + 260, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 0.8, color: DARK_TEXT });
    page.drawText('Date:', { x: MARGIN + 260, y: y + 10, size: 8, font: bold, color: DARK_TEXT });

    // Attempt to inject the automated Signature & Stamp (matches Form 19)
    try {
        const fs = require('fs');
        const path = require('path');

        let baseDir = process.cwd();
        if (!baseDir.endsWith('cases')) {
            baseDir = path.join(baseDir, 'apps', 'cases');
        }

        const sigPath = path.join(baseDir, 'public', 'assets', 'images', 'Aaron Nzotho Signature.png');
        const stampPath = path.join(baseDir, 'public', 'assets', 'images', 'Zenowethu Debt Management stamp.png');

        if (fs.existsSync(sigPath)) {
            const sigBytes = fs.readFileSync(sigPath);
            const sigImage = await doc.embedPng(sigBytes);
            const sigDims = sigImage.scale(0.35);
            page.drawImage(sigImage, { x: MARGIN + 20, y: signatureLineY - 40, width: sigDims.width, height: sigDims.height });
        }

        if (fs.existsSync(stampPath)) {
            const stampBytes = fs.readFileSync(stampPath);
            const stampImage = await doc.embedPng(stampBytes);
            const stampDims = stampImage.scale(0.4);
            page.drawImage(stampImage, { x: MARGIN + 270, y: signatureLineY - 80, width: stampDims.width, height: stampDims.height });
        }
    } catch (e) {
        console.warn('Could not embed signature/stamp images:', e);
    }

    y -= 12;
    page.drawText(`${data.dcName}  |  ${data.dcNcrdcNo}`, { x: MARGIN, y, size: 7.5, font, color: MID_GRAY });
    page.drawText(withdrawalDate, { x: MARGIN + 260, y, size: 7.5, font, color: MID_GRAY });

    // ── FOOTER (matches Form 19) ──────────────────────────────────────────────
    const pages = doc.getPages();
    for (let p = 0; p < pages.length; p++) {
        const pg = pages[p];
        const footerY = 12;
        pg.drawLine({ start: { x: MARGIN, y: footerY + 8 }, end: { x: PAGE_W - MARGIN, y: footerY + 8 }, thickness: 0.5, color: LIGHT_GRAY });

        const fileStr = `File: ${data.fileNumber}`;
        const formStr = `Form 17.W — Withdrawal from Debt Review`;
        const issuedLabelStr = `Issued: ${withdrawalDate}`;
        const pageStr = `Page ${p + 1} of ${pages.length}`;

        const fileW = font.widthOfTextAtSize(fileStr, 6.5);
        const formW = font.widthOfTextAtSize(formStr, 6.5);
        const issuedW = font.widthOfTextAtSize(issuedLabelStr, 6.5);
        const pageW = font.widthOfTextAtSize(pageStr, 6.5);

        const totalTextW = fileW + formW + issuedW + pageW;
        const availableW = PAGE_W - (2 * MARGIN);
        const gap = (availableW - totalTextW) / 3;

        const xFile = MARGIN;
        const xForm = xFile + fileW + gap;
        const xIssued = xForm + formW + gap;
        const xPage = xIssued + issuedW + gap;

        pg.drawText(fileStr, { x: xFile, y: footerY, size: 6.5, font, color: MID_GRAY });
        pg.drawText(formStr, { x: xForm, y: footerY, size: 6.5, font, color: MID_GRAY });
        pg.drawText(issuedLabelStr, { x: xIssued, y: footerY, size: 6.5, font, color: MID_GRAY });
        pg.drawText(pageStr, { x: xPage, y: footerY, size: 6.5, font, color: MID_GRAY });
    }

    return doc.save();
}
