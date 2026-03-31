import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';

// ── Colours ──────────────────────────────────────────────────────────────────
const BLACK      = rgb(0,    0,    0);
const DARK_GRAY  = rgb(0.2,  0.2,  0.2);
const MID_GRAY   = rgb(0.5,  0.5,  0.5);
const LIGHT_GRAY = rgb(0.93, 0.93, 0.93);
const WHITE      = rgb(1,    1,    1);
const TEAL       = rgb(0,    0.47, 0.47);  // NCR branding-ish

// ── Types ────────────────────────────────────────────────────────────────────
export interface Form16CreditAccount {
    creditorName:       string;
    accountNumber:      string | null;
    accountType:        string;
    outstandingBalance: number;
    monthlyInstalment:  number | null;
    interestRate:       number | null;
    isPrescribed:       boolean;
    isIncluded:         boolean;
}

export interface Form16Data {
    // Case
    fileNumber:             string;
    applicationDate:        Date;
    // Client
    firstName:              string;
    lastName:               string;
    idNumber:               string;
    email:                  string | null;
    phone:                  string | null;
    address:                string | null;
    // Employment
    employer:               string | null;
    employeeNo:             string | null;
    grossSalary:            number | null;
    netSalary:              number | null;
    salaryPayDate:          number | null;   // day of month
    // Debt summary
    totalDebtAmount:        number | null;
    totalMonthlyInstalment: number | null;
    // Credit accounts
    creditAccounts:         Form16CreditAccount[];
    // DC details
    dcName:                 string;
    dcNcrdcNo:              string;
    dcAddress:              string;
    dcPhone:                string;
    dcEmail:                string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
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

function drawSectionHeader(
    page: PDFPage,
    text: string,
    y: number,
    boldFont: PDFFont,
    width = 545,
    margin = 50
) {
    page.drawRectangle({ x: margin, y: y - 4, width: width - margin, height: 18, color: TEAL });
    page.drawText(text, { x: margin + 8, y: y + 1, size: 9, font: boldFont, color: WHITE });
    return y - 22;
}

function labelValue(
    page: PDFPage,
    label: string,
    value: string,
    x: number,
    y: number,
    font: PDFFont,
    boldFont: PDFFont,
    colWidth = 230
) {
    page.drawText(label, { x, y, size: 7.5, font, color: MID_GRAY });
    page.drawText(value, { x, y: y - 12, size: 8.5, font: boldFont, color: DARK_GRAY });
    drawHR(page, y - 14, x, x + colWidth, LIGHT_GRAY, 0.5);
}

// ── Main generator ───────────────────────────────────────────────────────────
export async function generateForm16(data: Form16Data): Promise<Uint8Array> {
    const doc  = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const PAGE_W = 595;   // A4
    const PAGE_H = 842;
    const MARGIN = 50;
    const CONTENT_W = PAGE_W - MARGIN * 2;

    let page = doc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - 40;

    // ── Helper: add new page when running out of space ──────────────────────
    const ensureSpace = (needed: number) => {
        if (y - needed < 60) {
            page = doc.addPage([PAGE_W, PAGE_H]);
            y = PAGE_H - 50;
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // HEADER
    // ═══════════════════════════════════════════════════════════════════════
    page.drawRectangle({ x: 0, y: PAGE_H - 80, width: PAGE_W, height: 80, color: TEAL });

    page.drawText('NATIONAL CREDIT ACT 34 OF 2005', {
        x: MARGIN, y: PAGE_H - 28, size: 9, font: bold, color: WHITE
    });
    page.drawText('SECTION 86(1) — APPLICATION FOR DEBT REVIEW', {
        x: MARGIN, y: PAGE_H - 42, size: 11, font: bold, color: WHITE
    });
    page.drawText('FORM 16', {
        x: PAGE_W - 100, y: PAGE_H - 28, size: 18, font: bold, color: WHITE
    });

    // Reference block (top-right)
    const refDate = data.applicationDate.toLocaleDateString('en-ZA', {
        day: '2-digit', month: 'long', year: 'numeric'
    });
    page.drawText(`File No: ${data.fileNumber}`, {
        x: PAGE_W - 180, y: PAGE_H - 52, size: 8, font: bold, color: WHITE
    });
    page.drawText(`Date: ${refDate}`, {
        x: PAGE_W - 180, y: PAGE_H - 64, size: 8, font, color: WHITE
    });

    y = PAGE_H - 95;

    // ═══════════════════════════════════════════════════════════════════════
    // INTRO NOTE
    // ═══════════════════════════════════════════════════════════════════════
    const introLines = [
        'I/We, the undersigned Consumer, hereby apply to the Debt Counsellor named below to be placed under debt review',
        'in terms of Section 86(1) of the National Credit Act 34 of 2005 and declare that I am/we are over-indebted.',
    ];
    for (const line of introLines) {
        page.drawText(line, { x: MARGIN, y, size: 8, font, color: DARK_GRAY });
        y -= 13;
    }
    y -= 8;

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 1 — DEBT COUNSELLOR DETAILS
    // ═══════════════════════════════════════════════════════════════════════
    y = drawSectionHeader(page, '1. DEBT COUNSELLOR DETAILS', y, bold, PAGE_W, MARGIN);
    y -= 10;

    const dc = [
        ['NCRDC Number', data.dcNcrdcNo],
        ['Debt Counsellor Name', data.dcName],
        ['Practice / Trading Name', 'Zenowethu (Pty) Ltd'],
    ];
    const dc2 = [
        ['Physical Address', data.dcAddress],
        ['Telephone / Cell', data.dcPhone],
        ['Email Address', data.dcEmail],
    ];

    for (let i = 0; i < dc.length; i++) {
        labelValue(page, dc[i][0], fmt(dc[i][1]), MARGIN, y, font, bold);
        labelValue(page, dc2[i][0], fmt(dc2[i][1]), MARGIN + 260, y, font, bold);
        y -= 32;
    }
    y -= 6;

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 2 — CONSUMER DETAILS
    // ═══════════════════════════════════════════════════════════════════════
    y = drawSectionHeader(page, '2. CONSUMER PERSONAL DETAILS', y, bold, PAGE_W, MARGIN);
    y -= 10;

    const fullName = `${data.firstName} ${data.lastName}`;
    labelValue(page, 'Full Name', fmt(fullName), MARGIN, y, font, bold);
    labelValue(page, 'SA Identity Number', fmt(data.idNumber), MARGIN + 260, y, font, bold);
    y -= 32;

    labelValue(page, 'Physical / Postal Address', fmt(data.address), MARGIN, y, font, bold, 460);
    y -= 32;

    labelValue(page, 'Cell / Telephone Number', fmt(data.phone), MARGIN, y, font, bold);
    labelValue(page, 'Email Address', fmt(data.email), MARGIN + 260, y, font, bold);
    y -= 36;

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 3 — EMPLOYMENT & INCOME
    // ═══════════════════════════════════════════════════════════════════════
    y = drawSectionHeader(page, '3. EMPLOYMENT & INCOME', y, bold, PAGE_W, MARGIN);
    y -= 10;

    labelValue(page, 'Employer Name', fmt(data.employer), MARGIN, y, font, bold);
    labelValue(page, 'Employee Number', fmt(data.employeeNo), MARGIN + 260, y, font, bold);
    y -= 32;

    labelValue(page, 'Gross Monthly Salary', zar(data.grossSalary), MARGIN, y, font, bold);
    labelValue(page, 'Net Monthly Salary (Take-Home)', zar(data.netSalary), MARGIN + 260, y, font, bold);
    y -= 32;

    const payDateStr = data.salaryPayDate
        ? `${data.salaryPayDate}${['th','st','nd','rd'][ data.salaryPayDate <= 3 ? data.salaryPayDate : 0]} of each month`
        : '___';
    labelValue(page, 'Salary Pay Date', payDateStr, MARGIN, y, font, bold);
    y -= 36;

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 4 — CREDIT AGREEMENTS
    // ═══════════════════════════════════════════════════════════════════════
    ensureSpace(60);
    y = drawSectionHeader(page, '4. LIST OF CREDIT AGREEMENTS', y, bold, PAGE_W, MARGIN);
    y -= 8;

    // Table header
    const cols = {
        no:        { x: MARGIN,       w: 24 },
        creditor:  { x: MARGIN + 26,  w: 130 },
        accNo:     { x: MARGIN + 158, w: 85 },
        type:      { x: MARGIN + 245, w: 75 },
        balance:   { x: MARGIN + 322, w: 75 },
        instalment:{ x: MARGIN + 399, w: 75 },
        rate:      { x: MARGIN + 476, w: 40 },
    };

    page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_W, height: 15, color: LIGHT_GRAY });
    const headers: [string, number][] = [
        ['#', cols.no.x],
        ['Credit Provider', cols.creditor.x],
        ['Account Number', cols.accNo.x],
        ['Account Type', cols.type.x],
        ['Balance (ZAR)', cols.balance.x],
        ['Monthly Instal.', cols.instalment.x],
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

    // Totals row
    drawHR(page, y + 10, MARGIN, MARGIN + CONTENT_W, TEAL, 1);
    y -= 4;
    page.drawText('TOTALS', { x: cols.creditor.x, y, size: 8, font: bold, color: TEAL });
    page.drawText(zar(data.totalDebtAmount), { x: cols.balance.x, y, size: 8, font: bold, color: TEAL });
    page.drawText(zar(data.totalMonthlyInstalment), { x: cols.instalment.x, y, size: 8, font: bold, color: TEAL });
    y -= 20;

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 5 — DECLARATION
    // ═══════════════════════════════════════════════════════════════════════
    ensureSpace(120);
    y = drawSectionHeader(page, '5. DECLARATION BY CONSUMER', y, bold, PAGE_W, MARGIN);
    y -= 12;

    const declaration = [
        'I/We declare that:',
        '  1. The information provided in this application is true and correct.',
        '  2. I/We am/are unable to satisfy all my/our obligations under all my/our credit agreements in a timely manner.',
        '  3. I/We consent to the Debt Counsellor obtaining my/our credit bureau information and income verification.',
        '  4. I/We understand that applying for debt review may affect my/our ability to obtain further credit.',
        '  5. I/We have not applied for, or been subject to, debt review in the past 12 months without formal conclusion.',
        '  6. I/We acknowledge that the Debt Counsellor will notify all credit providers of this application.',
    ];

    for (const line of declaration) {
        ensureSpace(14);
        const isMain = line === 'I/We declare that:';
        page.drawText(line, {
            x: MARGIN, y, size: 8,
            font: isMain ? bold : font,
            color: isMain ? DARK_GRAY : DARK_GRAY
        });
        y -= 13;
    }
    y -= 10;

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 6 — SIGNATURE BLOCK
    // ═══════════════════════════════════════════════════════════════════════
    ensureSpace(110);
    y = drawSectionHeader(page, '6. SIGNATURES', y, bold, PAGE_W, MARGIN);
    y -= 20;

    // Consumer signature
    page.drawText('Consumer Signature:', { x: MARGIN, y, size: 8, font: bold, color: DARK_GRAY });
    page.drawLine({
        start: { x: MARGIN + 120, y },
        end:   { x: MARGIN + 320, y },
        thickness: 0.8, color: DARK_GRAY
    });
    page.drawText('Date:', { x: MARGIN + 340, y, size: 8, font: bold, color: DARK_GRAY });
    page.drawLine({
        start: { x: MARGIN + 370, y },
        end:   { x: CONTENT_W + MARGIN, y },
        thickness: 0.8, color: DARK_GRAY
    });
    y -= 8;
    page.drawText(`Print Name: ${fullName}`, { x: MARGIN + 120, y, size: 7.5, font, color: MID_GRAY });
    y -= 30;

    // Second signer (spouse / joint applicant) — optional
    page.drawText('Joint Applicant (if applicable):', { x: MARGIN, y, size: 8, font: bold, color: DARK_GRAY });
    page.drawLine({
        start: { x: MARGIN + 160, y },
        end:   { x: MARGIN + 320, y },
        thickness: 0.8, color: DARK_GRAY
    });
    page.drawText('Date:', { x: MARGIN + 340, y, size: 8, font: bold, color: DARK_GRAY });
    page.drawLine({
        start: { x: MARGIN + 370, y },
        end:   { x: CONTENT_W + MARGIN, y },
        thickness: 0.8, color: DARK_GRAY
    });
    y -= 30;

    // DC acceptance
    page.drawText('Accepted by Debt Counsellor:', { x: MARGIN, y, size: 8, font: bold, color: DARK_GRAY });
    page.drawLine({
        start: { x: MARGIN + 160, y },
        end:   { x: MARGIN + 320, y },
        thickness: 0.8, color: DARK_GRAY
    });
    page.drawText('Date:', { x: MARGIN + 340, y, size: 8, font: bold, color: DARK_GRAY });
    page.drawLine({
        start: { x: MARGIN + 370, y },
        end:   { x: CONTENT_W + MARGIN, y },
        thickness: 0.8, color: DARK_GRAY
    });
    y -= 8;
    page.drawText(`NCRDC: ${data.dcNcrdcNo}`, { x: MARGIN + 160, y, size: 7.5, font, color: MID_GRAY });
    y -= 30;

    // ═══════════════════════════════════════════════════════════════════════
    // FOOTER — every page
    // ═══════════════════════════════════════════════════════════════════════
    const pages = doc.getPages();
    for (let p = 0; p < pages.length; p++) {
        const pg = pages[p];
        pg.drawLine({
            start: { x: MARGIN, y: 40 }, end: { x: PAGE_W - MARGIN, y: 40 },
            thickness: 0.5, color: LIGHT_GRAY
        });
        pg.drawText(
            `Form 16 — Section 86(1) NCA 34 of 2005  |  File: ${data.fileNumber}  |  Generated: ${new Date().toLocaleDateString('en-ZA')}`,
            { x: MARGIN, y: 28, size: 6.5, font, color: MID_GRAY }
        );
        pg.drawText(`Page ${p + 1} of ${pages.length}`, {
            x: PAGE_W - MARGIN - 50, y: 28, size: 6.5, font, color: MID_GRAY
        });
    }

    return doc.save();
}
