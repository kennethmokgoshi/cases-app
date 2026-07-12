import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';

// ── Colours (match Form 16/17 branding) ────────────────────────────────────────
const DARK_GRAY  = rgb(0.2,  0.2,  0.2);
const MID_GRAY   = rgb(0.5,  0.5,  0.5);
const LIGHT_GRAY = rgb(0.93, 0.93, 0.93);
const WHITE      = rgb(1,    1,    1);
const TEAL       = rgb(0,    0.47, 0.47);
const RED        = rgb(0.72, 0.11, 0.11);

export interface Form172AData {
    fileNumber:             string;
    rejectionDate:          Date;
    applicationDate:        Date;
    // Consumer
    firstName:              string;
    lastName:               string;
    idNumber:               string;
    email:                  string | null;
    phone:                  string | null;
    address:                string | null;
    // Financial grounds for the determination
    openAccounts:           number;
    closedAccounts:         number;
    totalOutstandingBalance:number;
    totalMonthlyInstalment: number;
    netIncome:              number | null;
    monthlySurplus:         number | null;
    bankConfirmed:          boolean;
    // DC details
    dcName:                 string;
    dcNcrdcNo:              string;
    dcAddress:              string;
    dcPhone:                string;
    dcEmail:                string;
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
export async function generateForm172A(data: Form172AData): Promise<Uint8Array> {
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
    page.drawText('SECTION 86(7)(a) — REJECTION OF DEBT REVIEW APPLICATION', {
        x: MARGIN, y: PAGE_H - 42, size: 10, font: bold, color: WHITE
    });
    page.drawText('FORM 17.2(a)', {
        x: PAGE_W - 135, y: PAGE_H - 28, size: 16, font: bold, color: WHITE
    });

    const rejDate = data.rejectionDate.toLocaleDateString('en-ZA', {
        day: '2-digit', month: 'long', year: 'numeric'
    });
    page.drawText(`File No: ${data.fileNumber}`, {
        x: PAGE_W - 180, y: PAGE_H - 52, size: 8, font: bold, color: WHITE
    });
    page.drawText(`Date: ${rejDate}`, {
        x: PAGE_W - 180, y: PAGE_H - 64, size: 8, font, color: WHITE
    });

    y = PAGE_H - 95;

    // ── INTRO ─────────────────────────────────────────────────────────────────
    const intro = [
        'Notice is hereby given in terms of Section 86(7)(a) of the National Credit Act 34 of 2005 that the',
        'debt counsellor, having assessed the application for debt review referred to below, has made a',
        'determination that the consumer does NOT appear to be over-indebted. The application for debt',
        'review is accordingly REJECTED.',
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
    const appDate  = data.applicationDate.toLocaleDateString('en-ZA', {
        day: '2-digit', month: 'long', year: 'numeric'
    });

    labelValue(page, 'Full Name', fmt(fullName), MARGIN, y, font, bold);
    labelValue(page, 'SA Identity Number', fmt(data.idNumber), MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(page, 'Address', fmt(data.address), MARGIN, y, font, bold, 460);
    y -= 32;
    labelValue(page, 'Cell / Telephone', fmt(data.phone), MARGIN, y, font, bold);
    labelValue(page, 'Email Address', fmt(data.email), MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(page, 'Date of Debt Review Application', appDate, MARGIN, y, font, bold);
    labelValue(page, 'Date of Determination', rejDate, MARGIN + 260, y, font, bold);
    y -= 36;

    // ── SECTION 3 — FINANCIAL GROUNDS ────────────────────────────────────────
    ensureSpace(120);
    y = drawSectionHeader(page, '3. FINANCIAL GROUNDS FOR THE DETERMINATION', y, bold, PAGE_W, MARGIN);
    y -= 10;

    labelValue(page, 'Open Credit Accounts',   String(data.openAccounts),   MARGIN,       y, font, bold);
    labelValue(page, 'Closed Credit Accounts', String(data.closedAccounts), MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(page, 'Total Outstanding Balance', zar(data.totalOutstandingBalance), MARGIN,       y, font, bold);
    labelValue(page, 'Total Monthly Instalments', zar(data.totalMonthlyInstalment),  MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(page, 'Verified Net Monthly Income', data.netIncome != null ? zar(data.netIncome) : '—', MARGIN, y, font, bold);
    labelValue(page, 'Monthly Surplus After Instalments', data.monthlySurplus != null ? zar(data.monthlySurplus) : '—', MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(
        page, 'Income Verification',
        data.bankConfirmed
            ? 'Net income confirmed against salary deposit on bank statement'
            : 'Not confirmed against bank statement — manual verification performed',
        MARGIN, y, font, bold, 460
    );
    y -= 40;

    // ── SECTION 4 — DETERMINATION ────────────────────────────────────────────
    ensureSpace(110);
    y = drawSectionHeader(page, '4. DETERMINATION IN TERMS OF SECTION 86(7)(a)', y, bold, PAGE_W, MARGIN);
    y -= 14;

    page.drawText('APPLICATION REJECTED — CONSUMER NOT OVER-INDEBTED', {
        x: MARGIN, y, size: 10, font: bold, color: RED
    });
    y -= 18;

    const determination = [
        'Having considered the consumer\'s verified net income, total monthly debt obligations and the',
        'information furnished by the consumer, the consumer\'s total monthly instalments are LESS than the',
        'consumer\'s verified net monthly income. The consumer is therefore able to satisfy, in a timely',
        'manner, all obligations under the credit agreements to which the consumer is a party.',
        '',
        'The consumer accordingly does not appear to be over-indebted as contemplated in Section 79 of the',
        'Act, and the application for debt review is rejected in terms of Section 86(7)(a).',
    ];
    for (const line of determination) {
        ensureSpace(14);
        page.drawText(line, { x: MARGIN, y, size: 8, font, color: DARK_GRAY });
        y -= 13;
    }
    y -= 10;

    // ── SECTION 5 — CONSUMER RIGHTS ──────────────────────────────────────────
    ensureSpace(90);
    y = drawSectionHeader(page, '5. CONSUMER RIGHTS — SECTION 86(9)', y, bold, PAGE_W, MARGIN);
    y -= 14;

    const rights = [
        'If a debt counsellor rejects an application as contemplated in Section 86(7)(a), the consumer,',
        'with leave of the Magistrate\'s Court, may apply directly to the Magistrate\'s Court in terms of',
        'Section 86(9) of the Act, for an order contemplated in Section 86(7)(c).',
        '',
        'The consumer must be provided with a copy of this Form 17.2(a) together with the affordability',
        'assessment on which this determination is based.',
    ];
    for (const line of rights) {
        ensureSpace(14);
        page.drawText(line, { x: MARGIN, y, size: 8, font, color: DARK_GRAY });
        y -= 13;
    }
    y -= 10;

    // ── SECTION 6 — DC SIGNATURE ──────────────────────────────────────────────
    ensureSpace(80);
    y = drawSectionHeader(page, '6. DEBT COUNSELLOR DECLARATION', y, bold, PAGE_W, MARGIN);
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
            `Form 17.2(a) — Rejection of Debt Review Application  |  File: ${data.fileNumber}  |  Generated: ${new Date().toLocaleDateString('en-ZA')}`,
            { x: MARGIN, y: 28, size: 6.5, font, color: MID_GRAY }
        );
        pg.drawText(`Page ${p + 1} of ${pages.length}`, {
            x: PAGE_W - MARGIN - 50, y: 28, size: 6.5, font, color: MID_GRAY
        });
    }

    return doc.save();
}
