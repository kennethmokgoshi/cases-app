import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';

const BLACK      = rgb(0,    0,    0);
const DARK_GRAY  = rgb(0.2,  0.2,  0.2);
const MID_GRAY   = rgb(0.5,  0.5,  0.5);
const LIGHT_GRAY = rgb(0.93, 0.93, 0.93);
const WHITE      = rgb(1,    1,    1);
const TEAL       = rgb(0,    0.47, 0.47);

export interface Section86Data {
    fileNumber:       string;
    noticeDate:       Date;
    applicationDate:  Date;
    // Consumer
    firstName:        string;
    lastName:         string;
    idNumber:         string;
    email:            string | null;
    phone:            string | null;
    address:          string | null;
    // Financial summary
    totalDebtAmount:  number | null;
    grossSalary:      number | null;
    netSalary:        number | null;
    // DC details
    dcName:           string;
    dcNcrdcNo:        string;
    dcAddress:        string;
    dcPhone:          string;
    dcEmail:          string;
}

function fmt(val: string | null | undefined, fallback = '_______________'): string {
    return val?.trim() || fallback;
}

function zar(amount: number | null | undefined): string {
    if (amount == null) return 'R 0.00';
    return new Intl.NumberFormat('en-ZA', {
        style: 'currency', currency: 'ZAR', minimumFractionDigits: 2
    }).format(amount);
}

function drawHR(page: PDFPage, y: number, x1 = 50, x2 = 545, color = LIGHT_GRAY, thickness = 0.5) {
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
}

function drawSectionHeader(page: PDFPage, text: string, y: number, boldFont: PDFFont, width = 545, margin = 50) {
    page.drawRectangle({ x: margin, y: y - 4, width: width - margin, height: 18, color: TEAL });
    page.drawText(text, { x: margin + 8, y: y + 1, size: 9, font: boldFont, color: WHITE });
    return y - 22;
}

function labelValue(
    page: PDFPage, label: string, value: string,
    x: number, y: number, font: PDFFont, boldFont: PDFFont, colWidth = 230
) {
    page.drawText(label, { x, y, size: 7.5, font, color: MID_GRAY });
    page.drawText(value, { x, y: y - 12, size: 8.5, font: boldFont, color: DARK_GRAY });
    drawHR(page, y - 14, x, x + colWidth, LIGHT_GRAY, 0.5);
}

export async function generateSection86Notice(data: Section86Data): Promise<Uint8Array> {
    const doc  = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const PAGE_W = 595;
    const PAGE_H = 842;
    const MARGIN = 50;
    const CONTENT_W = PAGE_W - MARGIN * 2;

    const page = doc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - 40;

    // ── HEADER ────────────────────────────────────────────────────────────────
    page.drawRectangle({ x: 0, y: PAGE_H - 80, width: PAGE_W, height: 80, color: TEAL });

    page.drawText('NATIONAL CREDIT ACT 34 OF 2005', {
        x: MARGIN, y: PAGE_H - 28, size: 9, font: bold, color: WHITE
    });
    page.drawText('SECTION 86(2) — NOTICE OF RECEIPT OF APPLICATION FOR DEBT REVIEW', {
        x: MARGIN, y: PAGE_H - 42, size: 9.5, font: bold, color: WHITE
    });
    page.drawText('S86(2)', {
        x: PAGE_W - 100, y: PAGE_H - 28, size: 14, font: bold, color: WHITE
    });

    const noticeDateStr = data.noticeDate.toLocaleDateString('en-ZA', {
        day: '2-digit', month: 'long', year: 'numeric'
    });
    page.drawText(`File No: ${data.fileNumber}`, {
        x: PAGE_W - 180, y: PAGE_H - 52, size: 8, font: bold, color: WHITE
    });
    page.drawText(`Date: ${noticeDateStr}`, {
        x: PAGE_W - 180, y: PAGE_H - 64, size: 8, font, color: WHITE
    });

    y = PAGE_H - 95;

    // ── INTRO ─────────────────────────────────────────────────────────────────
    const intro = [
        `Dear ${data.firstName} ${data.lastName},`,
        '',
        'This notice serves as confirmation that your application for debt review has been received by',
        'Zenowethu (Pty) Ltd in terms of Section 86(2) of the National Credit Act 34 of 2005.',
    ];
    for (const line of intro) {
        if (line === '') { y -= 6; continue; }
        const isSalutation = line.startsWith('Dear');
        page.drawText(line, { x: MARGIN, y, size: 8, font: isSalutation ? bold : font, color: DARK_GRAY });
        y -= 13;
    }
    y -= 8;

    // ── SECTION 1 — CONSUMER DETAILS ─────────────────────────────────────────
    y = drawSectionHeader(page, '1. CONSUMER DETAILS', y, bold, PAGE_W, MARGIN);
    y -= 10;

    const fullName = `${data.firstName} ${data.lastName}`;
    labelValue(page, 'Full Name', fmt(fullName), MARGIN, y, font, bold);
    labelValue(page, 'SA Identity Number', fmt(data.idNumber), MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(page, 'Address', fmt(data.address), MARGIN, y, font, bold, 460);
    y -= 32;
    labelValue(page, 'Cell / Telephone', fmt(data.phone), MARGIN, y, font, bold);
    labelValue(page, 'Email Address', fmt(data.email), MARGIN + 260, y, font, bold);
    y -= 36;

    // ── SECTION 2 — APPLICATION DETAILS ──────────────────────────────────────
    y = drawSectionHeader(page, '2. APPLICATION DETAILS', y, bold, PAGE_W, MARGIN);
    y -= 10;

    const appDateStr = data.applicationDate.toLocaleDateString('en-ZA', {
        day: '2-digit', month: 'long', year: 'numeric'
    });
    labelValue(page, 'Date of Application',     appDateStr, MARGIN, y, font, bold);
    labelValue(page, 'Reference / File Number', data.fileNumber, MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(page, 'Total Outstanding Debt',  zar(data.totalDebtAmount), MARGIN, y, font, bold);
    labelValue(page, 'Gross Monthly Income',    zar(data.grossSalary),     MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(page, 'Net Monthly Income',      zar(data.netSalary),       MARGIN, y, font, bold);
    y -= 36;

    // ── SECTION 3 — DEBT COUNSELLOR ───────────────────────────────────────────
    y = drawSectionHeader(page, '3. DEBT COUNSELLOR', y, bold, PAGE_W, MARGIN);
    y -= 10;

    labelValue(page, 'NCRDC Number',    data.dcNcrdcNo,  MARGIN, y, font, bold);
    labelValue(page, 'DC Name',         data.dcName,     MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(page, 'Practice Name',   'Zenowethu (Pty) Ltd', MARGIN, y, font, bold);
    y -= 32;
    labelValue(page, 'Address',         data.dcAddress,  MARGIN, y, font, bold, 460);
    y -= 32;
    labelValue(page, 'Telephone / Cell',data.dcPhone,    MARGIN, y, font, bold);
    labelValue(page, 'Email Address',   data.dcEmail,    MARGIN + 260, y, font, bold);
    y -= 36;

    // ── SECTION 4 — IMPORTANT INFORMATION ────────────────────────────────────
    y = drawSectionHeader(page, '4. IMPORTANT INFORMATION', y, bold, PAGE_W, MARGIN);
    y -= 12;

    const infoLines = [
        'As a result of your application for debt review, the following applies:',
        '',
        '  1. Your application has been formally lodged with all relevant credit providers in accordance',
        '     with Section 86(4)(b)(i) of the National Credit Act.',
        '',
        '  2. You are required to continue making payments under all existing credit agreements until a',
        '     restructuring plan has been agreed upon and confirmed by the Magistrate\'s Court.',
        '',
        '  3. The debt counsellor will assess your over-indebtedness within 30 business days of this notice.',
        '',
        '  4. If you are found to be over-indebted, a Debt Restructuring Proposal will be issued to all',
        '     credit providers proposing a revised repayment plan.',
        '',
        '  5. You will receive all documents for review and signature via the Zenowethu consumer portal.',
        '',
        'Please do not hesitate to contact your debt counsellor should you have any questions.',
    ];
    for (const line of infoLines) {
        if (line === '') { y -= 6; continue; }
        page.drawText(line, { x: MARGIN, y, size: 8, font, color: DARK_GRAY });
        y -= 13;
    }
    y -= 10;

    // ── SECTION 5 — DC SIGNATURE ──────────────────────────────────────────────
    y = drawSectionHeader(page, '5. DEBT COUNSELLOR CONFIRMATION', y, bold, PAGE_W, MARGIN);
    y -= 20;

    page.drawText('Signed by Debt Counsellor:', { x: MARGIN, y, size: 8, font: bold, color: DARK_GRAY });
    page.drawLine({ start: { x: MARGIN + 150, y }, end: { x: MARGIN + 330, y }, thickness: 0.8, color: DARK_GRAY });
    page.drawText('Date:', { x: MARGIN + 350, y, size: 8, font: bold, color: DARK_GRAY });
    page.drawLine({ start: { x: MARGIN + 380, y }, end: { x: CONTENT_W + MARGIN, y }, thickness: 0.8, color: DARK_GRAY });
    y -= 10;
    page.drawText(`${data.dcName}  |  NCRDC: ${data.dcNcrdcNo}`, { x: MARGIN + 150, y, size: 7.5, font, color: MID_GRAY });

    // ── FOOTER ────────────────────────────────────────────────────────────────
    const pages = doc.getPages();
    for (let p = 0; p < pages.length; p++) {
        const pg = pages[p];
        pg.drawLine({ start: { x: MARGIN, y: 40 }, end: { x: PAGE_W - MARGIN, y: 40 }, thickness: 0.5, color: LIGHT_GRAY });
        pg.drawText(
            `Section 86(2) Notice — NCA 34 of 2005  |  File: ${data.fileNumber}  |  Generated: ${new Date().toLocaleDateString('en-ZA')}`,
            { x: MARGIN, y: 28, size: 6.5, font, color: MID_GRAY }
        );
        pg.drawText(`Page ${p + 1} of ${pages.length}`, {
            x: PAGE_W - MARGIN - 50, y: 28, size: 6.5, font, color: MID_GRAY
        });
    }

    return doc.save();
}
