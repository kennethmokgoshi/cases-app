import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage, PDFEmbeddedPage } from 'pdf-lib';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';

// ── Colours (match Form 16/17 branding) ────────────────────────────────────────
const BLACK      = rgb(0,    0,    0);
const DARK_GRAY  = rgb(0.2,  0.2,  0.2);
const MID_GRAY   = rgb(0.5,  0.5,  0.5);
const LIGHT_GRAY = rgb(0.93, 0.93, 0.93);
const WHITE      = rgb(1,    1,    1);
const TEAL       = rgb(0,    0.47, 0.47);

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

export interface Form17WData {
    fileNumber:             string;
    withdrawalDate:         Date;
    // Consumer
    firstName:              string;
    lastName:               string;
    idNumber:               string;
    email:                  string | null;
    phone:                  string | null;
    address:                string | null;
    // DC details
    dcName:                 string;
    dcNcrdcNo:              string;
    dcAddress:              string;
    dcPhone:                string;
    dcEmail:                string;
    reasonForWithdrawal:    string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(val: string | null | undefined, fallback = '_______________'): string {
    return val?.trim() || fallback;
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

// ── Main generator ────────────────────────────────────────────────────────────
export async function generateForm17W(data: Form17WData): Promise<Uint8Array> {
    const doc  = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const PAGE_W = 595;
    const PAGE_H = 842;
    const MARGIN = 50;

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
    let y = PAGE_H - 40;

    const ensureSpace = (needed: number) => {
        if (y - needed < 60) {
            page = createNewPage();
            y = PAGE_H - 50;
        }
    };

    // ── HEADER ────────────────────────────────────────────────────────────────
    page.drawRectangle({ x: 0, y: PAGE_H - 80, width: PAGE_W, height: 80, color: TEAL });

    page.drawText('NATIONAL CREDIT ACT 34 OF 2005', {
        x: MARGIN, y: PAGE_H - 28, size: 9, font: bold, color: WHITE
    });
    page.drawText('WITHDRAWAL FROM DEBT REVIEW', {
        x: MARGIN, y: PAGE_H - 42, size: 10, font: bold, color: WHITE
    });
    page.drawText('FORM 17.W', {
        x: PAGE_W - 120, y: PAGE_H - 28, size: 16, font: bold, color: WHITE
    });

    const withdrawalDate = data.withdrawalDate.toLocaleDateString('en-ZA', {
        day: '2-digit', month: 'long', year: 'numeric'
    });
    page.drawText(`File No: ${data.fileNumber}`, {
        x: PAGE_W - 180, y: PAGE_H - 52, size: 8, font: bold, color: WHITE
    });
    page.drawText(`Date: ${withdrawalDate}`, {
        x: PAGE_W - 180, y: PAGE_H - 64, size: 8, font, color: WHITE
    });

    y = PAGE_H - 95;

    // ── INTRO ─────────────────────────────────────────────────────────────────
    const intro = [
        'Notice is hereby given that the consumer mentioned below is no longer under debt review.',
        'This notification is issued to all relevant credit providers and credit bureaus to update their',
        'records accordingly.',
    ];
    for (const line of intro) {
        page.drawText(line, { x: MARGIN, y, size: 8, font, color: DARK_GRAY });
        y -= 13;
    }
    y -= 8;

    // ── SECTION 1 — DC DETAILS ────────────────────────────────────────────────
    y = drawSectionHeader(page, '1. DEBT COUNSELLOR DETAILS', y, bold, PAGE_W, MARGIN);
    y -= 10;

    const dcLeft  = [['NCRDC Number', data.dcNcrdcNo], ['Debt Counsellor Name', data.dcName], ['Practice Name', 'Zenowethu (Pty) Ltd']];
    const dcRight = [['Physical Address', data.dcAddress], ['Telephone / Cell', data.dcPhone], ['Email Address', data.dcEmail]];
    for (let i = 0; i < dcLeft.length; i++) {
        labelValue(page, dcLeft[i][0],  fmt(dcLeft[i][1]),  MARGIN,       y, font, bold);
        labelValue(page, dcRight[i][0], fmt(dcRight[i][1]), MARGIN + 260, y, font, bold);
        y -= 32;
    }
    y -= 6;

    // ── SECTION 2 — CONSUMER DETAILS ─────────────────────────────────────────
    y = drawSectionHeader(page, '2. CONSUMER DETAILS', y, bold, PAGE_W, MARGIN);
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

    // ── SECTION 3 — REASON FOR WITHDRAWAL ────────────────────────────────────
    y = drawSectionHeader(page, '3. REASON FOR WITHDRAWAL', y, bold, PAGE_W, MARGIN);
    y -= 10;

    page.drawText(data.reasonForWithdrawal, {
        x: MARGIN, y, size: 9, font: bold, color: DARK_GRAY
    });
    y -= 30;

    // ── SECTION 4 — DC SIGNATURE ──────────────────────────────────────────────
    ensureSpace(80);
    y = drawSectionHeader(page, '4. DEBT COUNSELLOR ACCEPTANCE', y, bold, PAGE_W, MARGIN);
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
            `Form 17.W — Withdrawal from Debt Review  |  File: ${data.fileNumber}  |  Generated: ${new Date().toLocaleDateString('en-ZA')}`,
            { x: MARGIN, y: 28, size: 6.5, font, color: MID_GRAY }
        );
        pg.drawText(`Page ${p + 1} of ${pages.length}`, {
            x: PAGE_W - MARGIN - 50, y: 28, size: 6.5, font, color: MID_GRAY
        });
    }

    return doc.save();
}
