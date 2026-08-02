import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage, PDFEmbeddedPage } from 'pdf-lib';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';

// ── Colours (match POA branding — navy / dark / clean) ─────────────────────────
const PRIMARY_NAVY = rgb(0.05, 0.1,  0.25);   // Dark navy for section headers
const DARK_TEXT    = rgb(0.1,  0.1,  0.1);
const GRAY_LABEL   = rgb(0.35, 0.35, 0.35);   // Gray for labels
const MID_GRAY     = rgb(0.5,  0.5,  0.5);
const LIGHT_GRAY   = rgb(0.88, 0.88, 0.88);
const WHITE        = rgb(1,    1,    1);
const ACCENT_GOLD  = rgb(0.85, 0.55, 0.08);   // Gold underline accent (matches POA)
const GREEN_TEXT   = rgb(0.05, 0.45, 0.22);    // Certification highlight

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

export interface Form19Account {
    creditorName:       string;
    accountNumber:      string | null;
    accountType:        string;
    status:             string;
    outstandingBalance: number;
    lastPaymentDate:    Date | null;
}

export interface Form19Data {
    fileNumber:      string;
    issueDate:       Date;
    // Consumer
    firstName:       string;
    lastName:        string;
    idNumber:        string;
    address:         string | null;
    // Scope of the certificate
    /** true = all obligations settled (F2); false = all except mortgage (F1). */
    allObligationsSettled: boolean;
    mortgageCreditor:      string | null;   // shown when allObligationsSettled = false
    accounts:              Form19Account[];
    // DC details
    dcName:          string;
    dcNcrdcNo:       string;
    dcAddress:       string;
    dcPhone:         string;
    dcEmail:         string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function zar(amount: number | null | undefined): string {
    if (amount == null) return 'R 0.00';
    return new Intl.NumberFormat('en-ZA', {
        style: 'currency', currency: 'ZAR', minimumFractionDigits: 2
    }).format(amount);
}

function fmt(val: string | null | undefined, fallback = '_______________'): string {
    return val?.trim() || fallback;
}

/** Draw a dark navy section header bar matching the POA style */
function drawSectionHeader(page: PDFPage, num: string, text: string, y: number, bold: PDFFont, contentW: number, margin: number) {
    const barH = 22;
    page.drawRectangle({ x: margin, y: y - 6, width: contentW, height: barH, color: PRIMARY_NAVY });
    // Number circle
    const circleX = margin + 14;
    const circleY = y + 3;
    page.drawCircle({ x: circleX, y: circleY, size: 8, color: ACCENT_GOLD });
    page.drawText(num, { x: circleX - (num.length > 1 ? 4.5 : 3), y: circleY - 3.5, size: 8, font: bold, color: WHITE });
    // Section title
    page.drawText(text, { x: margin + 28, y: y, size: 10, font: bold, color: WHITE });
    return y - barH - 4;
}

/** Draw a bordered table row like the POA (label | value) */
function drawTableRow(
    page: PDFPage, label: string, value: string, y: number,
    font: PDFFont, bold: PDFFont, margin: number, contentW: number, splitAt = 150
): number {
    const rowH = 32;
    const boxY = y - rowH + 4;            // bottom of the rectangle
    // Outer border
    page.drawRectangle({ x: margin, y: boxY, width: contentW, height: rowH, borderWidth: 0.5, borderColor: LIGHT_GRAY });
    // Divider
    page.drawLine({ start: { x: margin + splitAt, y: boxY }, end: { x: margin + splitAt, y: boxY + rowH }, thickness: 0.5, color: LIGHT_GRAY });
    // Label (gray, uppercase) — sits near top of box
    page.drawText(label.toUpperCase(), { x: margin + 6, y: boxY + rowH - 11, size: 7, font, color: GRAY_LABEL });
    // Value (bold, dark) — sits in lower half of box
    page.drawText(value, { x: margin + splitAt + 8, y: boxY + rowH - 11, size: 9, font: bold, color: DARK_TEXT });
    return y - rowH;
}

/** Draw a two-column bordered row (like POA: label above value in each cell) */
function drawTwoColRow(
    page: PDFPage,
    label1: string, value1: string,
    label2: string, value2: string,
    y: number, font: PDFFont, bold: PDFFont, margin: number, contentW: number,
): number {
    const rowH = 36;
    const boxY = y - rowH + 4;
    const halfW = contentW / 2;
    // Left cell
    page.drawRectangle({ x: margin, y: boxY, width: halfW, height: rowH, borderWidth: 0.5, borderColor: LIGHT_GRAY });
    page.drawText(label1.toUpperCase(), { x: margin + 6, y: boxY + rowH - 12, size: 7, font, color: GRAY_LABEL });
    page.drawText(value1, { x: margin + 6, y: boxY + 6, size: 9, font: bold, color: DARK_TEXT });
    // Right cell
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

// ── Main generator ────────────────────────────────────────────────────────────
export async function generateForm19(data: Form19Data): Promise<Uint8Array> {
    const doc  = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const PAGE_W = 595;
    const PAGE_H = 842;
    const MARGIN = 50;
    const CONTENT_W = PAGE_W - 2 * MARGIN;

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
            y = PAGE_H - 130; // Reset to below the letterhead logo area for the new page
        }
    };

    // ── TITLE (centered, like POA) ───────────────────────────────────────────
    const title = 'CLEARANCE CERTIFICATE';
    const titleW = bold.widthOfTextAtSize(title, 16);
    page.drawText(title, {
        x: (PAGE_W - titleW) / 2, y, size: 16, font: bold, color: PRIMARY_NAVY
    });
    y -= 10;
    // Gold underline accent (like POA)
    const accentW = 40;
    page.drawRectangle({
        x: (PAGE_W - accentW) / 2, y, width: accentW, height: 3, color: ACCENT_GOLD
    });
    y -= 10; // Extra space before subtitle

    const subtitle = 'Form 19 — Section 71(1) of the National Credit Act 34 of 2005';
    const subtitleW = font.widthOfTextAtSize(subtitle, 8.5);
    page.drawText(subtitle, { x: (PAGE_W - subtitleW) / 2, y, size: 8.5, font, color: MID_GRAY });
    y -= 18;

    // File number & date
    const issueDate = data.issueDate.toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
    const fileNoStr = `File No: ${data.fileNumber}`;
    const dateStr = `Date of Issue: ${issueDate}`;
    
    // Left align File No
    page.drawText(fileNoStr, { x: MARGIN, y, size: 8, font, color: MID_GRAY });
    
    // Right align Date of Issue
    const dateW = font.widthOfTextAtSize(dateStr, 8);
    page.drawText(dateStr, { x: PAGE_W - MARGIN - dateW, y, size: 8, font, color: MID_GRAY });
    y -= 14;

    // ── INTRO TEXT ────────────────────────────────────────────────────────────
    const introText = data.allObligationsSettled
        ? 'This Clearance Certificate is issued in terms of Section 71(1) of the National Credit Act 34 of 2005. The debt counsellor certifies that the consumer named below has fully satisfied all of the consumer\'s obligations under every credit agreement that was subject to the debt re-arrangement.'
        : 'This Clearance Certificate is issued in terms of Section 71(1)(b) of the National Credit Act 34 of 2005. The debt counsellor certifies that the consumer named below has satisfied all obligations under every credit agreement that was subject to the debt re-arrangement, OTHER THAN a credit agreement secured by a mortgage bond, in respect of which the consumer is maintaining payments.';

    // Wrap text manually
    const words = introText.split(' ');
    let line = '';
    for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(testLine, 8) > CONTENT_W) {
            page.drawText(line, { x: MARGIN, y, size: 8, font, color: DARK_TEXT });
            y -= 12;
            line = word;
        } else {
            line = testLine;
        }
    }
    if (line) {
        page.drawText(line, { x: MARGIN, y, size: 8, font, color: DARK_TEXT });
        y -= 16;
    }

    y -= 12; // Extra space before Section 1

    // ── SECTION 1 — PRINCIPAL DETAILS (Consumer) ─────────────────────────────
    y = drawSectionHeader(page, '1', 'PRINCIPAL DETAILS', y, bold, CONTENT_W, MARGIN);
    y -= 4;

    y = drawFullRow(page, 'Full Name & Surname', `${data.firstName} ${data.lastName}`, y, font, bold, MARGIN, CONTENT_W);
    y = drawTwoColRow(page, 'Identity Number', fmt(data.idNumber), 'Date of Birth', extractDOB(data.idNumber), y, font, bold, MARGIN, CONTENT_W);
    y = drawFullRow(page, 'Residential Address', fmt(data.address, '—'), y, font, bold, MARGIN, CONTENT_W);
    y -= 10;

    // ── SECTION 2 — DEBT COUNSELLOR DETAILS ──────────────────────────────────
    ensureSpace(100);
    y = drawSectionHeader(page, '2', 'DEBT COUNSELLOR DETAILS', y, bold, CONTENT_W, MARGIN);
    y -= 4;

    y = drawFullRow(page, 'Trading Name', 'Zenowethu Debt Management (Pty) Ltd', y, font, bold, MARGIN, CONTENT_W);
    y = drawTwoColRow(page, 'NCRDC Number', fmt(data.dcNcrdcNo), 'Debt Counsellor Name', fmt(data.dcName), y, font, bold, MARGIN, CONTENT_W);
    y = drawTwoColRow(page, 'Contact Number', fmt(data.dcPhone), 'Email Address', fmt(data.dcEmail), y, font, bold, MARGIN, CONTENT_W);
    y = drawFullRow(page, 'Physical Address', fmt(data.dcAddress), y, font, bold, MARGIN, CONTENT_W);
    y -= 10;

    y -= 12; // Extra space before Section 3

    // ── SECTION 3 — CREDIT AGREEMENTS ────────────────────────────────────────
    ensureSpace(80);
    y = drawSectionHeader(page, '3', 'THE DEBTS SET OUT HEREUNDER HAVE BEEN SETTLED IN FULL', y, bold, CONTENT_W, MARGIN);
    y -= 4;

    // Table header row
    const colPositions = {
        creditor: MARGIN + 4,
        date:     MARGIN + 220,
        amount:   MARGIN + 380,
    };

    page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_W, height: 16, color: rgb(0.92, 0.92, 0.92) });
    const tableHeaders: [string, number][] = [
        ['Name of Credit Provider', colPositions.creditor],
        ['Date of last payment', colPositions.date],
        ['Full amount settled', colPositions.amount],
    ];
    for (const [h, hx] of tableHeaders) {
        page.drawText(h, { x: hx, y: y, size: 7.5, font: bold, color: PRIMARY_NAVY });
    }
    y -= 18;

    // Table data rows
    for (let i = 0; i < data.accounts.length; i++) {
        ensureSpace(18);
        const acc = data.accounts[i];
        const rowColor = i % 2 === 0 ? WHITE : rgb(0.97, 0.97, 0.97);
        page.drawRectangle({ x: MARGIN, y: y - 3, width: CONTENT_W, height: 15, color: rowColor });
        // Border
        page.drawRectangle({ x: MARGIN, y: y - 3, width: CONTENT_W, height: 15, borderWidth: 0.3, borderColor: LIGHT_GRAY });

        const formattedDate = acc.lastPaymentDate
            ? acc.lastPaymentDate.toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' })
            : '—';

        const rowData: [string, number][] = [
            [acc.creditorName.substring(0, 35), colPositions.creditor],
            [formattedDate, colPositions.date],
            [zar(acc.outstandingBalance), colPositions.amount],
        ];
        for (const [val, vx] of rowData) {
            page.drawText(val, { x: vx, y: y + 1, size: 7.5, font, color: DARK_TEXT });
        }
        y -= 16;
    }

    if (data.accounts.length === 0) {
        page.drawRectangle({ x: MARGIN, y: y - 3, width: CONTENT_W, height: 15, borderWidth: 0.3, borderColor: LIGHT_GRAY });
        const noAccText = 'No credit accounts listed — all obligations have been fully satisfied.';
        page.drawText(noAccText, { x: MARGIN + 6, y: y + 1, size: 7.5, font, color: MID_GRAY });
        y -= 16;
    }
    y -= 10;

    // ── SECTION 4 — CERTIFICATION ────────────────────────────────────────────
    ensureSpace(180);
    y = drawSectionHeader(page, '4', 'CERTIFICATION', y, bold, CONTENT_W, MARGIN);
    y -= 8;

    // Green highlight certification line
    const certHighlight = data.allObligationsSettled
        ? 'ALL OBLIGATIONS UNDER THE RE-ARRANGED CREDIT AGREEMENTS HAVE BEEN SATISFIED'
        : 'ALL OBLIGATIONS SATISFIED EXCEPT THE MORTGAGE AGREEMENT — SECTION 71(1)(b)';
    page.drawText(certHighlight, { x: MARGIN, y, size: 9, font: bold, color: GREEN_TEXT });
    y -= 20;

    // Certification text with requested line breaking to fix whitespace
    // Certification text with auto-wrapping to fix whitespace
    const certText = `I, ${data.dcName} (Registration No. ${data.dcNcrdcNo}), a debt counsellor registered in terms of Section 44 of the National Credit Act, hereby certify that the information contained in this certificate is true and correct, and that this certificate is issued in terms of Section 71(1) of the Act read with Regulation 27.`;
    
    const certWords = certText.split(' ');
    let certLine = '';
    for (const word of certWords) {
        const testLine = certLine ? `${certLine} ${word}` : word;
        if (font.widthOfTextAtSize(testLine, 8) > CONTENT_W) {
            ensureSpace(14);
            page.drawText(certLine, { x: MARGIN, y, size: 8, font, color: DARK_TEXT });
            y -= 13;
            certLine = word;
        } else {
            certLine = testLine;
        }
    }
    if (certLine) {
        ensureSpace(14);
        page.drawText(certLine, { x: MARGIN, y, size: 8, font, color: DARK_TEXT });
        y -= 13;
    }

    if (!data.allObligationsSettled && data.mortgageCreditor) {
        y -= 6;
        const mortgageLine = `The remaining credit agreement secured by a mortgage bond is held with ${data.mortgageCreditor}, in respect of which the consumer is maintaining the required payments.`;
        ensureSpace(14);
        page.drawText(mortgageLine, { x: MARGIN, y, size: 8, font, color: DARK_TEXT });
        y -= 13;
    }
    y -= 20;

    // ── SIGNATURE BLOCK ──────────────────────────────────────────────────────
    ensureSpace(130);

    // DC Signature
    page.drawText('Signature:', { x: MARGIN, y, size: 8, font: bold, color: DARK_TEXT });
    y -= 6;
    
    // Save the Y coordinate where the line is drawn so we can stamp the images right on top of it
    const signatureLineY = y;
    
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 200, y }, thickness: 0.8, color: DARK_TEXT });
    page.drawLine({ start: { x: MARGIN + 260, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 0.8, color: DARK_TEXT });
    
    // Attempt to inject the automated Signature & Stamp
    try {
        const fs = require('fs');
        const path = require('path');
        
        // Next.js sets cwd to apps/cases, but our test script sets it to the root
        let baseDir = process.cwd();
        if (!baseDir.endsWith('cases')) {
            baseDir = path.join(baseDir, 'apps', 'cases');
        }
        
        const sigPath = path.join(baseDir, 'public', 'assets', 'images', 'Aaron Nzotho Signature.png');
        const stampPath = path.join(baseDir, 'public', 'assets', 'images', 'Zenowethu Debt Management stamp.png');
        
        if (fs.existsSync(sigPath)) {
            const sigBytes = fs.readFileSync(sigPath);
            const sigImage = await doc.embedPng(sigBytes);
            const sigDims = sigImage.scale(0.35); // Scale down
            page.drawImage(sigImage, {
                x: MARGIN + 20,
                y: signatureLineY - 40, // Dropped down significantly
                width: sigDims.width,
                height: sigDims.height,
            });
        }
        
        if (fs.existsSync(stampPath)) {
            const stampBytes = fs.readFileSync(stampPath);
            const stampImage = await doc.embedPng(stampBytes);
            const stampDims = stampImage.scale(0.4); // Scale down
            page.drawImage(stampImage, {
                x: MARGIN + 270,
                y: signatureLineY - 80, // Dropped down significantly
                width: stampDims.width,
                height: stampDims.height,
            });
        }
    } catch (e) {
        // Silently ignore if images are missing or there's an issue embedding them
        console.warn('Could not embed signature/stamp images:', e);
    }
    
    y -= 12;
    page.drawText(`${data.dcName}  |  ${data.dcNcrdcNo}`, { x: MARGIN, y, size: 7.5, font, color: MID_GRAY });
    page.drawText(`Date: ${issueDate}`, { x: MARGIN + 260, y, size: 7.5, font, color: MID_GRAY });
    y -= 28;

    // Commissioner of Oaths
    page.drawText('CERTIFICATION (Commissioner of Oaths / Certifying Officer):', { x: MARGIN, y, size: 8, font: bold, color: DARK_TEXT });
    y -= 14;
    page.drawText('I certify that this is a true copy of the original Form 19 Clearance Certificate.', { x: MARGIN, y, size: 8, font, color: DARK_TEXT });
    y -= 20;

    // Signature lines
    page.drawText('Full Name:', { x: MARGIN, y, size: 8, font: bold, color: DARK_TEXT });
    page.drawLine({ start: { x: MARGIN + 60, y }, end: { x: MARGIN + 230, y }, thickness: 0.8, color: DARK_TEXT });
    page.drawText('Signature:', { x: MARGIN + 260, y, size: 8, font: bold, color: DARK_TEXT });
    page.drawLine({ start: { x: MARGIN + 320, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 0.8, color: DARK_TEXT });
    y -= 20;
    page.drawText('Capacity:', { x: MARGIN, y, size: 8, font: bold, color: DARK_TEXT });
    page.drawLine({ start: { x: MARGIN + 60, y }, end: { x: MARGIN + 230, y }, thickness: 0.8, color: DARK_TEXT });
    page.drawText('Date:', { x: MARGIN + 260, y, size: 8, font: bold, color: DARK_TEXT });
    page.drawLine({ start: { x: MARGIN + 320, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 0.8, color: DARK_TEXT });

    const issuedStr = `${data.issueDate.getFullYear()}/${String(data.issueDate.getMonth() + 1).padStart(2, '0')}/${String(data.issueDate.getDate()).padStart(2, '0')}`;
    
    // ── FOOTER ────────────────────────────────────────────────────────────────
    const pages = doc.getPages();
    for (let p = 0; p < pages.length; p++) {
        const pg = pages[p];
        const footerY = 12; // Move down slightly more to ensure it fits perfectly below the letterhead
        pg.drawLine({ start: { x: MARGIN, y: footerY + 8 }, end: { x: PAGE_W - MARGIN, y: footerY + 8 }, thickness: 0.5, color: LIGHT_GRAY });
        
        // Calculate widths for equal spacing
        const fileStr = `File: ${data.fileNumber}`;
        const formStr = `Form 19 — Clearance Certificate`;
        const issuedLabelStr = `Issued: ${issuedStr}`;
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

/** Extract date of birth from SA ID number (YYMMDD...) */
function extractDOB(idNumber: string): string {
    if (!idNumber || idNumber.length < 6) return '—';
    const yy = parseInt(idNumber.substring(0, 2), 10);
    const mm = idNumber.substring(2, 4);
    const dd = idNumber.substring(4, 6);
    const century = yy >= 0 && yy <= 30 ? '20' : '19';
    return `${dd}/${mm}/${century}${idNumber.substring(0, 2)}`;
}
