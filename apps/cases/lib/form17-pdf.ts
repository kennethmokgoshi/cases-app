import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';

// ── Colours (match Form 16 branding) ─────────────────────────────────────────
const BLACK      = rgb(0,    0,    0);
const DARK_GRAY  = rgb(0.2,  0.2,  0.2);
const MID_GRAY   = rgb(0.5,  0.5,  0.5);
const LIGHT_GRAY = rgb(0.93, 0.93, 0.93);
const WHITE      = rgb(1,    1,    1);
const TEAL       = rgb(0,    0.47, 0.47);

export interface Form17CreditAccount {
    creditorName:       string;
    accountNumber:      string | null;
    accountType:        string;
    outstandingBalance: number;
    monthlyInstalment:  number | null;
    interestRate:       number | null;
    isPrescribed:       boolean;
    isIncluded:         boolean;
}

export interface Form17Data {
    fileNumber:             string;
    notificationDate:       Date;
    applicationDate:        Date;
    // Consumer
    firstName:              string;
    lastName:               string;
    idNumber:               string;
    email:                  string | null;
    phone:                  string | null;
    address:                string | null;
    // Debt summary
    totalDebtAmount:        number | null;
    totalMonthlyInstalment: number | null;
    // Credit accounts
    creditAccounts:         Form17CreditAccount[];
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
export async function generateForm17(data: Form17Data): Promise<Uint8Array> {
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
    page.drawText('SECTION 86(4)(b)(i) — NOTIFICATION TO CREDIT PROVIDERS', {
        x: MARGIN, y: PAGE_H - 42, size: 10, font: bold, color: WHITE
    });
    page.drawText('FORM 17.1', {
        x: PAGE_W - 115, y: PAGE_H - 28, size: 16, font: bold, color: WHITE
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
        'Notice is hereby given in terms of Section 86(4)(b)(i) of the National Credit Act 34 of 2005 that',
        'the consumer mentioned below has applied for debt review on the date stated. As credit provider,',
        'you are hereby notified of this application and required to respond as prescribed by the Act.',
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
    labelValue(page, 'Date of Application', appDate, MARGIN, y, font, bold);
    y -= 36;

    // ── SECTION 3 — CREDIT AGREEMENTS ────────────────────────────────────────
    ensureSpace(60);
    y = drawSectionHeader(page, '3. LIST OF CREDIT AGREEMENTS UNDER REVIEW', y, bold, PAGE_W, MARGIN);
    y -= 8;

    const cols = {
        no:        { x: MARGIN,       w: 24  },
        creditor:  { x: MARGIN + 26,  w: 130 },
        accNo:     { x: MARGIN + 158, w: 85  },
        type:      { x: MARGIN + 245, w: 75  },
        balance:   { x: MARGIN + 322, w: 75  },
        instalment:{ x: MARGIN + 399, w: 75  },
        rate:      { x: MARGIN + 476, w: 40  },
    };

    page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_W, height: 15, color: LIGHT_GRAY });
    const headers: [string, number][] = [
        ['#', cols.no.x], ['Credit Provider', cols.creditor.x],
        ['Account Number', cols.accNo.x], ['Account Type', cols.type.x],
        ['Balance (ZAR)', cols.balance.x], ['Monthly Instal.', cols.instalment.x],
        ['Rate %', cols.rate.x],
    ];
    for (const [h, hx] of headers) {
        page.drawText(h, { x: hx, y: y - 2, size: 7, font: bold, color: DARK_GRAY });
    }
    y -= 18;

    const included = data.creditAccounts.filter(a => a.isIncluded);
    for (let i = 0; i < included.length; i++) {
        ensureSpace(18);
        const acc = included[i];
        const rowColor = i % 2 === 0 ? WHITE : rgb(0.97, 0.97, 0.97);
        page.drawRectangle({ x: MARGIN, y: y - 3, width: CONTENT_W, height: 14, color: rowColor });

        const row: [string, number][] = [
            [`${i + 1}`, cols.no.x],
            [acc.creditorName.substring(0, 22), cols.creditor.x],
            [fmt(acc.accountNumber, '—').substring(0, 18), cols.accNo.x],
            [acc.accountType.replace('_', ' '), cols.type.x],
            [zar(acc.outstandingBalance), cols.balance.x],
            [zar(acc.monthlyInstalment), cols.instalment.x],
            [acc.interestRate != null ? `${acc.interestRate}%` : '—', cols.rate.x],
        ];
        for (const [val, vx] of row) {
            page.drawText(val, { x: vx, y, size: 7.5, font, color: DARK_GRAY });
        }

        if (acc.isPrescribed) {
            page.drawText('PRESCRIBED', {
                x: cols.rate.x + 42, y, size: 6.5, font: bold, color: rgb(0.8, 0.2, 0.2)
            });
        }
        y -= 16;
    }

    drawHR(page, y + 10, MARGIN, MARGIN + CONTENT_W, TEAL, 1);
    y -= 4;
    page.drawText('TOTALS', { x: cols.creditor.x, y, size: 8, font: bold, color: TEAL });
    page.drawText(zar(data.totalDebtAmount), { x: cols.balance.x, y, size: 8, font: bold, color: TEAL });
    page.drawText(zar(data.totalMonthlyInstalment), { x: cols.instalment.x, y, size: 8, font: bold, color: TEAL });
    y -= 20;

    // ── SECTION 4 — STATUTORY NOTICE ─────────────────────────────────────────
    ensureSpace(100);
    y = drawSectionHeader(page, '4. STATUTORY NOTICE TO CREDIT PROVIDER', y, bold, PAGE_W, MARGIN);
    y -= 12;

    const notice = [
        'In terms of Section 86(4)(b)(ii) of the NCA, you are required to:',
        '  • Not proceed with enforcement of the credit agreement while the debt review is in progress.',
        '  • Provide the debt counsellor with a certificate of balance for each account within 5 business days.',
        '  • Provide notice of any pending legal proceedings under Section 86(4)(c) within 5 business days.',
        '',
        'In terms of Section 86(5), if you fail to respond within the prescribed period, the debt counsellor',
        'may proceed to make a recommendation without your input.',
        '',
        'This notice serves as formal confirmation that the consumer has applied for debt review in terms of',
        'Section 86(1) of the NCA and that all credit providers are hereby notified accordingly.',
    ];

    for (const line of notice) {
        ensureSpace(14);
        if (line === '') { y -= 6; continue; }
        page.drawText(line, { x: MARGIN, y, size: 8, font, color: DARK_GRAY });
        y -= 13;
    }
    y -= 10;

    // ── SECTION 5 — DC SIGNATURE ──────────────────────────────────────────────
    ensureSpace(80);
    y = drawSectionHeader(page, '5. DEBT COUNSELLOR ACCEPTANCE', y, bold, PAGE_W, MARGIN);
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
            `Form 17.1 — Section 86(4)(b)(i) NCA 34 of 2005  |  File: ${data.fileNumber}  |  Generated: ${new Date().toLocaleDateString('en-ZA')}`,
            { x: MARGIN, y: 28, size: 6.5, font, color: MID_GRAY }
        );
        pg.drawText(`Page ${p + 1} of ${pages.length}`, {
            x: PAGE_W - MARGIN - 50, y: 28, size: 6.5, font, color: MID_GRAY
        });
    }

    return doc.save();
}
