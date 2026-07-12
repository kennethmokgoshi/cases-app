import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';

// ── Colours (match Form 16/17 branding) ────────────────────────────────────────
const DARK_GRAY  = rgb(0.2,  0.2,  0.2);
const MID_GRAY   = rgb(0.5,  0.5,  0.5);
const LIGHT_GRAY = rgb(0.93, 0.93, 0.93);
const WHITE      = rgb(1,    1,    1);
const TEAL       = rgb(0,    0.47, 0.47);
const GREEN      = rgb(0.05, 0.5,  0.25);
const RED        = rgb(0.72, 0.11, 0.11);

export interface AffordabilityAccountRow {
    creditorName:       string;
    accountNumber:      string | null;
    accountType:        string;
    status:             string;
    outstandingBalance: number;
    monthlyInstalment:  number | null;
}

export interface AffordabilityAssessmentData {
    fileNumber:              string;
    assessmentDate:          Date;
    // Consumer
    firstName:               string;
    lastName:                string;
    idNumber:                string;
    employer:                string | null;
    // Income
    grossSalary:             number | null;
    netIncome:               number | null;
    netIncomeSource:         string;        // e.g. 'Payslip (analysed document)'
    bankStatementDeposit:    number | null;
    bankStatementDate:       string | null;
    bankConfirmed:           boolean;
    incomeNotes:             string[];
    // Credit report summary
    openAccounts:            number;
    closedAccounts:          number;
    totalOutstandingBalance: number;
    totalMonthlyInstalment:  number;
    monthlySurplus:          number | null;
    isAffordable:            boolean | null;
    accounts:                AffordabilityAccountRow[];
    // DC details
    dcName:                  string;
    dcNcrdcNo:               string;
    dcAddress:               string;
    dcPhone:                 string;
    dcEmail:                 string;
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
export async function generateAffordabilityAssessment(data: AffordabilityAssessmentData): Promise<Uint8Array> {
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

    page.drawText('NATIONAL CREDIT ACT 34 OF 2005 — SECTION 86(6)(a)', {
        x: MARGIN, y: PAGE_H - 28, size: 9, font: bold, color: WHITE
    });
    page.drawText('AFFORDABILITY ASSESSMENT — DETERMINATION OF OVER-INDEBTEDNESS', {
        x: MARGIN, y: PAGE_H - 42, size: 10, font: bold, color: WHITE
    });

    const assessDate = data.assessmentDate.toLocaleDateString('en-ZA', {
        day: '2-digit', month: 'long', year: 'numeric'
    });
    page.drawText(`File No: ${data.fileNumber}`, {
        x: PAGE_W - 180, y: PAGE_H - 56, size: 8, font: bold, color: WHITE
    });
    page.drawText(`Date: ${assessDate}`, {
        x: PAGE_W - 180, y: PAGE_H - 68, size: 8, font, color: WHITE
    });

    y = PAGE_H - 95;

    // ── INTRO ─────────────────────────────────────────────────────────────────
    const intro = [
        'This affordability assessment was performed in terms of Section 86(6)(a) of the National Credit Act',
        'to determine whether the consumer appears to be over-indebted. The consumer\'s total monthly debt',
        'instalments were assessed against the net income reflected on the consumer\'s payslip and verified',
        'against the salary deposit on the consumer\'s bank statement.',
    ];
    for (const line of intro) {
        page.drawText(line, { x: MARGIN, y, size: 8, font, color: DARK_GRAY });
        y -= 13;
    }
    y -= 8;

    // ── SECTION 1 — CONSUMER ─────────────────────────────────────────────────
    y = drawSectionHeader(page, '1. CONSUMER DETAILS', y, bold, PAGE_W, MARGIN);
    y -= 10;

    labelValue(page, 'Full Name', fmt(`${data.firstName} ${data.lastName}`), MARGIN, y, font, bold);
    labelValue(page, 'SA Identity Number', fmt(data.idNumber), MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(page, 'Employer', fmt(data.employer, '—'), MARGIN, y, font, bold);
    labelValue(page, 'Assessment Date', assessDate, MARGIN + 260, y, font, bold);
    y -= 36;

    // ── SECTION 2 — INCOME & VERIFICATION ────────────────────────────────────
    y = drawSectionHeader(page, '2. INCOME & BANK STATEMENT VERIFICATION', y, bold, PAGE_W, MARGIN);
    y -= 10;

    labelValue(page, 'Gross Monthly Income', data.grossSalary != null ? zar(data.grossSalary) : '—', MARGIN, y, font, bold);
    labelValue(page, 'Net Monthly Income (Payslip)', data.netIncome != null ? zar(data.netIncome) : '—', MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(page, 'Net Income Source', fmt(data.netIncomeSource, '—'), MARGIN, y, font, bold);
    labelValue(
        page, 'Salary Deposit on Bank Statement',
        data.bankStatementDeposit != null
            ? `${zar(data.bankStatementDeposit)}${data.bankStatementDate ? ` on ${data.bankStatementDate}` : ''}`
            : 'Not found',
        MARGIN + 260, y, font, bold
    );
    y -= 34;

    page.drawText(data.bankConfirmed ? 'INCOME VERIFIED' : 'INCOME NOT VERIFIED', {
        x: MARGIN, y, size: 9, font: bold, color: data.bankConfirmed ? GREEN : RED
    });
    y -= 14;
    for (const note of data.incomeNotes) {
        ensureSpace(12);
        page.drawText(`• ${note}`.substring(0, 118), { x: MARGIN, y, size: 7.5, font, color: MID_GRAY });
        y -= 11;
    }
    y -= 10;

    // ── SECTION 3 — CREDIT REPORT SUMMARY ────────────────────────────────────
    ensureSpace(90);
    y = drawSectionHeader(page, '3. CREDIT REPORT SUMMARY', y, bold, PAGE_W, MARGIN);
    y -= 10;

    labelValue(page, 'Open Credit Accounts',   String(data.openAccounts),   MARGIN,       y, font, bold);
    labelValue(page, 'Closed Credit Accounts', String(data.closedAccounts), MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(page, 'Total Outstanding Balance', zar(data.totalOutstandingBalance), MARGIN,       y, font, bold);
    labelValue(page, 'Total Monthly Instalments', zar(data.totalMonthlyInstalment),  MARGIN + 260, y, font, bold);
    y -= 36;

    // ── SECTION 4 — CREDIT ACCOUNTS ──────────────────────────────────────────
    ensureSpace(60);
    y = drawSectionHeader(page, '4. CREDIT ACCOUNTS CONSIDERED', y, bold, PAGE_W, MARGIN);
    y -= 8;

    const cols = {
        no:        { x: MARGIN       },
        creditor:  { x: MARGIN + 26  },
        accNo:     { x: MARGIN + 160 },
        type:      { x: MARGIN + 250 },
        status:    { x: MARGIN + 322 },
        balance:   { x: MARGIN + 372 },
        instalment:{ x: MARGIN + 448 },
    };

    page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_W, height: 15, color: LIGHT_GRAY });
    const headers: [string, number][] = [
        ['#', cols.no.x], ['Credit Provider', cols.creditor.x],
        ['Account Number', cols.accNo.x], ['Type', cols.type.x],
        ['Status', cols.status.x], ['Balance', cols.balance.x],
        ['Instalment', cols.instalment.x],
    ];
    for (const [h, hx] of headers) {
        page.drawText(h, { x: hx, y: y - 2, size: 7, font: bold, color: DARK_GRAY });
    }
    y -= 18;

    for (let i = 0; i < data.accounts.length; i++) {
        ensureSpace(18);
        const acc = data.accounts[i];
        const rowColor = i % 2 === 0 ? WHITE : rgb(0.97, 0.97, 0.97);
        page.drawRectangle({ x: MARGIN, y: y - 3, width: CONTENT_W, height: 14, color: rowColor });

        const row: [string, number][] = [
            [`${i + 1}`, cols.no.x],
            [acc.creditorName.substring(0, 24), cols.creditor.x],
            [fmt(acc.accountNumber, '—').substring(0, 16), cols.accNo.x],
            [acc.accountType.replace('_', ' ').substring(0, 12), cols.type.x],
            [acc.status.substring(0, 8), cols.status.x],
            [zar(acc.outstandingBalance), cols.balance.x],
            [zar(acc.monthlyInstalment), cols.instalment.x],
        ];
        for (const [val, vx] of row) {
            page.drawText(val, { x: vx, y, size: 7.5, font, color: DARK_GRAY });
        }
        y -= 16;
    }

    drawHR(page, y + 10, MARGIN, MARGIN + CONTENT_W, TEAL, 1);
    y -= 4;
    page.drawText('TOTALS (OPEN ACCOUNTS)', { x: cols.creditor.x, y, size: 8, font: bold, color: TEAL });
    page.drawText(zar(data.totalOutstandingBalance), { x: cols.balance.x, y, size: 8, font: bold, color: TEAL });
    page.drawText(zar(data.totalMonthlyInstalment), { x: cols.instalment.x, y, size: 8, font: bold, color: TEAL });
    y -= 24;

    // ── SECTION 5 — DETERMINATION ────────────────────────────────────────────
    ensureSpace(120);
    y = drawSectionHeader(page, '5. AFFORDABILITY DETERMINATION', y, bold, PAGE_W, MARGIN);
    y -= 10;

    labelValue(page, 'Verified Net Monthly Income', data.netIncome != null ? zar(data.netIncome) : '—', MARGIN, y, font, bold);
    labelValue(page, 'Less: Total Monthly Instalments', zar(data.totalMonthlyInstalment), MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(page, 'Monthly Surplus / (Shortfall)', data.monthlySurplus != null ? zar(data.monthlySurplus) : '—', MARGIN, y, font, bold);
    y -= 36;

    if (data.isAffordable === true) {
        page.drawText('CONCLUSION: CONSUMER IS NOT OVER-INDEBTED', {
            x: MARGIN, y, size: 10, font: bold, color: GREEN
        });
        y -= 16;
        const conclusion = [
            'The consumer\'s total monthly instalments are LESS than the consumer\'s verified net monthly income.',
            'The consumer is able to meet all obligations under the consumer\'s credit agreements in a timely',
            'manner and does not appear to be over-indebted as contemplated in Section 79 of the Act.',
        ];
        for (const line of conclusion) {
            ensureSpace(14);
            page.drawText(line, { x: MARGIN, y, size: 8, font, color: DARK_GRAY });
            y -= 13;
        }
    } else if (data.isAffordable === false) {
        page.drawText('CONCLUSION: CONSUMER APPEARS TO BE OVER-INDEBTED', {
            x: MARGIN, y, size: 10, font: bold, color: RED
        });
        y -= 16;
        const conclusion = [
            'The consumer\'s total monthly instalments EXCEED the consumer\'s verified net monthly income.',
            'The consumer appears to be over-indebted as contemplated in Section 79 of the Act.',
        ];
        for (const line of conclusion) {
            ensureSpace(14);
            page.drawText(line, { x: MARGIN, y, size: 8, font, color: DARK_GRAY });
            y -= 13;
        }
    } else {
        page.drawText('CONCLUSION: INSUFFICIENT INCOME INFORMATION — MANUAL ASSESSMENT REQUIRED', {
            x: MARGIN, y, size: 9, font: bold, color: RED
        });
        y -= 16;
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
            `Affordability Assessment  |  File: ${data.fileNumber}  |  Generated: ${new Date().toLocaleDateString('en-ZA')}`,
            { x: MARGIN, y: 28, size: 6.5, font, color: MID_GRAY }
        );
        pg.drawText(`Page ${p + 1} of ${pages.length}`, {
            x: PAGE_W - MARGIN - 50, y: 28, size: 6.5, font, color: MID_GRAY
        });
    }

    return doc.save();
}
