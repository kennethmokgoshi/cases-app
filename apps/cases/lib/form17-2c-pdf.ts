import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';

// ── Colours (match Form 16/17 branding) ────────────────────────────────────────
const DARK_GRAY  = rgb(0.2,  0.2,  0.2);
const MID_GRAY   = rgb(0.5,  0.5,  0.5);
const LIGHT_GRAY = rgb(0.93, 0.93, 0.93);
const WHITE      = rgb(1,    1,    1);
const TEAL       = rgb(0,    0.47, 0.47);
const GREEN      = rgb(0.05, 0.5,  0.25);

export interface Form172CData {
    fileNumber:        string;
    notificationDate:  Date;
    // Consumer
    firstName:         string;
    lastName:          string;
    idNumber:          string;
    email:             string | null;
    phone:             string | null;
    address:           string | null;
    // Settled position
    settledAccountCount: number;
    // Remaining mortgage
    mortgageCreditor:      string | null;
    mortgageAccountNumber: string | null;
    mortgageBalance:       number | null;
    mortgageInstalment:    number | null;
    // DC details
    dcName:            string;
    dcNcrdcNo:         string;
    dcAddress:         string;
    dcPhone:           string;
    dcEmail:           string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function zar(amount: number | null | undefined): string {
    if (amount == null) return '—';
    return new Intl.NumberFormat('en-ZA', {
        style: 'currency', currency: 'ZAR', minimumFractionDigits: 2
    }).format(amount);
}

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
export async function generateForm172C(data: Form172CData): Promise<Uint8Array> {
    const doc  = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const PAGE_W = 595;
    const PAGE_H = 842;
    const MARGIN = 50;
    const CONTENT_W = PAGE_W - MARGIN * 2;

    let page = doc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - 40;

    const ensureSpace = (needed: number) => {
        if (y - needed < 60) {
            page = doc.addPage([PAGE_W, PAGE_H]);
            y = PAGE_H - 50;
        }
    };

    // ── HEADER ────────────────────────────────────────────────────────────────
    page.drawRectangle({ x: 0, y: PAGE_H - 80, width: PAGE_W, height: 80, color: TEAL });

    page.drawText('NATIONAL CREDIT ACT 34 OF 2005', {
        x: MARGIN, y: PAGE_H - 28, size: 9, font: bold, color: WHITE
    });
    page.drawText('NOTIFICATION — OBLIGATIONS SETTLED EXCEPT MORTGAGE (S 71(1)(b))', {
        x: MARGIN, y: PAGE_H - 42, size: 10, font: bold, color: WHITE
    });
    page.drawText('FORM 17.2(c)', {
        x: PAGE_W - 135, y: PAGE_H - 28, size: 16, font: bold, color: WHITE
    });

    const notifDate = data.notificationDate.toLocaleDateString('en-ZA', {
        day: '2-digit', month: 'long', year: 'numeric'
    });
    page.drawText(`File No: ${data.fileNumber}`, {
        x: PAGE_W - 180, y: PAGE_H - 52, size: 8, font: bold, color: WHITE
    });
    page.drawText(`Date: ${notifDate}`, {
        x: PAGE_W - 180, y: PAGE_H - 64, size: 8, font, color: WHITE
    });

    y = PAGE_H - 95;

    // ── INTRO ─────────────────────────────────────────────────────────────────
    const intro = [
        'Notice is hereby given to all affected credit providers and registered credit bureaus that the',
        'consumer mentioned below has satisfied all obligations under every credit agreement that was',
        'subject to the debt re-arrangement, OTHER THAN the credit agreement secured by a mortgage bond',
        'referred to in Section 3 below, in respect of which payments are being maintained as required by',
        'Section 71(1)(b) of the National Credit Act.',
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

    labelValue(page, 'Full Name', fmt(`${data.firstName} ${data.lastName}`), MARGIN, y, font, bold);
    labelValue(page, 'SA Identity Number', fmt(data.idNumber), MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(page, 'Address', fmt(data.address), MARGIN, y, font, bold, 460);
    y -= 32;
    labelValue(page, 'Cell / Telephone', fmt(data.phone), MARGIN, y, font, bold);
    labelValue(page, 'Email Address', fmt(data.email), MARGIN + 260, y, font, bold);
    y -= 36;

    // ── SECTION 3 — REMAINING MORTGAGE AGREEMENT ─────────────────────────────
    y = drawSectionHeader(page, '3. REMAINING MORTGAGE AGREEMENT', y, bold, PAGE_W, MARGIN);
    y -= 10;

    labelValue(page, 'Mortgage Credit Provider', fmt(data.mortgageCreditor, '—'), MARGIN, y, font, bold);
    labelValue(page, 'Account Number', fmt(data.mortgageAccountNumber, '—'), MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(page, 'Outstanding Balance', zar(data.mortgageBalance), MARGIN, y, font, bold);
    labelValue(page, 'Monthly Instalment (Being Maintained)', zar(data.mortgageInstalment), MARGIN + 260, y, font, bold);
    y -= 36;

    // ── SECTION 4 — DECLARATION ──────────────────────────────────────────────
    ensureSpace(110);
    y = drawSectionHeader(page, '4. DECLARATION', y, bold, PAGE_W, MARGIN);
    y -= 14;

    page.drawText(`${data.settledAccountCount} RE-ARRANGED CREDIT AGREEMENT(S) SETTLED — MORTGAGE PAYMENTS MAINTAINED`, {
        x: MARGIN, y, size: 9, font: bold, color: GREEN
    });
    y -= 18;

    const declaration = [
        'The debt counsellor declares that, per the certified Form 19 Clearance Certificate issued for this',
        'consumer, all obligations under every credit agreement that was subject to the debt re-arrangement',
        'have been satisfied, other than the mortgage agreement above. Credit bureaus are requested to',
        'update their records accordingly in terms of Section 71 of the Act.',
    ];
    for (const line of declaration) {
        ensureSpace(14);
        page.drawText(line, { x: MARGIN, y, size: 8, font, color: DARK_GRAY });
        y -= 13;
    }
    y -= 16;

    // ── SECTION 5 — DC SIGNATURE ──────────────────────────────────────────────
    ensureSpace(80);
    y = drawSectionHeader(page, '5. DEBT COUNSELLOR SIGNATURE', y, bold, PAGE_W, MARGIN);
    y -= 24;

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
            `Form 17.2(c) — Settled Except Mortgage  |  File: ${data.fileNumber}  |  Generated: ${new Date().toLocaleDateString('en-ZA')}`,
            { x: MARGIN, y: 28, size: 6.5, font, color: MID_GRAY }
        );
        pg.drawText(`Page ${p + 1} of ${pages.length}`, {
            x: PAGE_W - MARGIN - 50, y: 28, size: 6.5, font, color: MID_GRAY
        });
    }

    return doc.save();
}
