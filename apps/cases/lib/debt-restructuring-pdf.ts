import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';

const DARK_GRAY  = rgb(0.2,  0.2,  0.2);
const MID_GRAY   = rgb(0.5,  0.5,  0.5);
const LIGHT_GRAY = rgb(0.93, 0.93, 0.93);
const WHITE      = rgb(1,    1,    1);
const TEAL       = rgb(0,    0.47, 0.47);
const GREEN      = rgb(0.1,  0.6,  0.3);

export interface RestructuringAccount {
    creditorName:          string;
    accountNumber:         string | null;
    accountType:           string;
    outstandingBalance:    number;
    currentInstalment:     number | null;
    proposedInstalment:    number;     // May equal currentInstalment if no restructuring yet
    newInterestRate:       number | null;
    newTermMonths:         number | null;
    isPrescribed:          boolean;
    isIncluded:            boolean;
}

export interface DebtRestructuringData {
    fileNumber:             string;
    proposalDate:           Date;
    // Consumer
    firstName:              string;
    lastName:               string;
    idNumber:               string;
    email:                  string | null;
    phone:                  string | null;
    address:                string | null;
    // Income
    grossSalary:            number | null;
    netSalary:              number | null;
    livingExpenses:         number | null;   // estimated monthly living expenses
    // Accounts
    creditAccounts:         RestructuringAccount[];
    // Totals
    totalDebtAmount:        number | null;
    totalCurrentInstalment: number | null;
    totalProposedInstalment: number;
    // DC details
    dcName:                 string;
    dcNcrdcNo:              string;
    dcAddress:              string;
    dcPhone:                string;
    dcEmail:                string;
}

function zar(amount: number | null | undefined): string {
    if (amount == null) return 'R 0.00';
    return new Intl.NumberFormat('en-ZA', {
        style: 'currency', currency: 'ZAR', minimumFractionDigits: 2
    }).format(amount);
}

function fmt(val: string | null | undefined, fallback = '—'): string {
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

export async function generateDebtRestructuringProposal(data: DebtRestructuringData): Promise<Uint8Array> {
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
    page.drawText('DEBT RESTRUCTURING PROPOSAL', {
        x: MARGIN, y: PAGE_H - 42, size: 12, font: bold, color: WHITE
    });
    page.drawText('Section 86(7)(b)', {
        x: MARGIN, y: PAGE_H - 57, size: 8, font, color: WHITE
    });

    const proposalDateStr = data.proposalDate.toLocaleDateString('en-ZA', {
        day: '2-digit', month: 'long', year: 'numeric'
    });
    page.drawText(`File No: ${data.fileNumber}`, {
        x: PAGE_W - 180, y: PAGE_H - 40, size: 8, font: bold, color: WHITE
    });
    page.drawText(`Date: ${proposalDateStr}`, {
        x: PAGE_W - 180, y: PAGE_H - 52, size: 8, font, color: WHITE
    });

    y = PAGE_H - 95;

    // ── INTRO ─────────────────────────────────────────────────────────────────
    const intro = [
        'This proposal is made in terms of Section 86(7)(b) of the National Credit Act 34 of 2005.',
        'The debt counsellor, having assessed the consumer\'s financial position, hereby proposes the',
        'following restructuring of the consumer\'s credit obligations.',
    ];
    for (const line of intro) {
        page.drawText(line, { x: MARGIN, y, size: 8, font, color: DARK_GRAY });
        y -= 13;
    }
    y -= 8;

    // ── SECTION 1 — CONSUMER & DC DETAILS ────────────────────────────────────
    y = drawSectionHeader(page, '1. PARTIES', y, bold, PAGE_W, MARGIN);
    y -= 10;

    const fullName = `${data.firstName} ${data.lastName}`;
    labelValue(page, 'Consumer Full Name', fmt(fullName), MARGIN, y, font, bold);
    labelValue(page, 'SA Identity Number', fmt(data.idNumber), MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(page, 'Address', fmt(data.address), MARGIN, y, font, bold, 460);
    y -= 32;
    labelValue(page, 'Cell / Telephone', fmt(data.phone), MARGIN, y, font, bold);
    labelValue(page, 'Email Address',    fmt(data.email), MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(page, 'Debt Counsellor',  data.dcName,    MARGIN, y, font, bold);
    labelValue(page, 'NCRDC Number',     data.dcNcrdcNo, MARGIN + 260, y, font, bold);
    y -= 36;

    // ── SECTION 2 — AFFORDABILITY ASSESSMENT ─────────────────────────────────
    y = drawSectionHeader(page, '2. AFFORDABILITY ASSESSMENT', y, bold, PAGE_W, MARGIN);
    y -= 10;

    labelValue(page, 'Gross Monthly Income', zar(data.grossSalary),                   MARGIN, y, font, bold);
    labelValue(page, 'Net Monthly Income',   zar(data.netSalary),                     MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(page, 'Monthly Living Expenses', zar(data.livingExpenses),             MARGIN, y, font, bold);
    const disposable = (data.netSalary ?? 0) - (data.livingExpenses ?? 0);
    labelValue(page, 'Disposable Income',    zar(disposable > 0 ? disposable : 0),   MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(page, 'Current Total Debt Obligation', zar(data.totalCurrentInstalment), MARGIN, y, font, bold);
    labelValue(page, 'Proposed Total Monthly Payment', zar(data.totalProposedInstalment), MARGIN + 260, y, font, bold);
    y -= 36;

    // ── SECTION 3 — RESTRUCTURING TABLE ──────────────────────────────────────
    ensureSpace(60);
    y = drawSectionHeader(page, '3. PROPOSED RESTRUCTURED PAYMENT PLAN', y, bold, PAGE_W, MARGIN);
    y -= 8;

    const cols = {
        no:        { x: MARGIN,       w: 20  },
        creditor:  { x: MARGIN + 22,  w: 110 },
        accNo:     { x: MARGIN + 134, w: 75  },
        balance:   { x: MARGIN + 211, w: 65  },
        current:   { x: MARGIN + 278, w: 65  },
        proposed:  { x: MARGIN + 345, w: 70  },
        rate:      { x: MARGIN + 417, w: 35  },
        term:      { x: MARGIN + 454, w: 40  },
    };

    page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_W, height: 15, color: LIGHT_GRAY });
    const headers: [string, number][] = [
        ['#', cols.no.x], ['Credit Provider', cols.creditor.x],
        ['Account No', cols.accNo.x], ['Balance', cols.balance.x],
        ['Current', cols.current.x], ['Proposed', cols.proposed.x],
        ['Rate%', cols.rate.x], ['Term', cols.term.x],
    ];
    for (const [h, hx] of headers) {
        page.drawText(h, { x: hx, y: y - 2, size: 6.5, font: bold, color: DARK_GRAY });
    }
    y -= 18;

    const included = data.creditAccounts.filter(a => a.isIncluded);
    let proposedTotal = 0;
    let currentTotal  = 0;

    for (let i = 0; i < included.length; i++) {
        ensureSpace(18);
        const acc = included[i];
        proposedTotal += acc.proposedInstalment;
        currentTotal  += acc.currentInstalment ?? 0;

        const rowColor = i % 2 === 0 ? WHITE : rgb(0.97, 0.97, 0.97);
        page.drawRectangle({ x: MARGIN, y: y - 3, width: CONTENT_W, height: 14, color: rowColor });

        const savings = (acc.currentInstalment ?? 0) - acc.proposedInstalment;
        const proposedColor = savings > 0 ? GREEN : DARK_GRAY;

        const row: [string, number][] = [
            [`${i + 1}`, cols.no.x],
            [acc.creditorName.substring(0, 18), cols.creditor.x],
            [fmt(acc.accountNumber, '—').substring(0, 14), cols.accNo.x],
            [zar(acc.outstandingBalance), cols.balance.x],
            [zar(acc.currentInstalment), cols.current.x],
            [acc.newInterestRate != null ? `${acc.newInterestRate}%` : '—', cols.rate.x],
            [acc.newTermMonths != null ? `${acc.newTermMonths}m` : '—', cols.term.x],
        ];
        for (const [val, vx] of row) {
            page.drawText(val, { x: vx, y, size: 7, font, color: DARK_GRAY });
        }
        // Proposed instalment in green if reduced
        page.drawText(zar(acc.proposedInstalment), { x: cols.proposed.x, y, size: 7, font: bold, color: proposedColor });

        if (acc.isPrescribed) {
            page.drawText('PRESCRIBED', {
                x: cols.term.x + 42, y, size: 6, font: bold, color: rgb(0.8, 0.2, 0.2)
            });
        }
        y -= 16;
    }

    // Totals row
    drawHR(page, y + 10, MARGIN, MARGIN + CONTENT_W, TEAL, 1);
    y -= 4;
    page.drawText('TOTALS', { x: cols.creditor.x, y, size: 8, font: bold, color: TEAL });
    page.drawText(zar(data.totalDebtAmount), { x: cols.balance.x, y, size: 8, font: bold, color: TEAL });
    page.drawText(zar(currentTotal),  { x: cols.current.x,  y, size: 8, font: bold, color: TEAL });
    page.drawText(zar(proposedTotal), { x: cols.proposed.x, y, size: 8, font: bold, color: GREEN });
    y -= 20;

    // Savings callout
    const monthlySavings = currentTotal - proposedTotal;
    if (monthlySavings > 0) {
        ensureSpace(30);
        y -= 6;
        page.drawRectangle({ x: MARGIN, y: y - 18, width: CONTENT_W, height: 24, color: rgb(0.9, 1, 0.93) });
        page.drawText(
            `Monthly savings under proposed plan: ${zar(monthlySavings)}  |  Reduction: ${((monthlySavings / currentTotal) * 100).toFixed(1)}%`,
            { x: MARGIN + 8, y: y - 8, size: 8.5, font: bold, color: GREEN }
        );
        y -= 30;
    }

    // ── SECTION 4 — TERMS ─────────────────────────────────────────────────────
    ensureSpace(100);
    y -= 6;
    y = drawSectionHeader(page, '4. TERMS OF PROPOSAL', y, bold, PAGE_W, MARGIN);
    y -= 12;

    const terms = [
        '  1. This proposal is subject to acceptance by all credit providers within the period prescribed by the Act.',
        '  2. The consumer undertakes to make all payments strictly on time and as agreed.',
        '  3. In the event of default, any credit provider may reinstate collection proceedings.',
        '  4. This proposal constitutes a recommendation to the Magistrate\'s Court for a consent order.',
        '  5. Payments will be distributed through a Payment Distribution Agency (PDA) appointed by Zenowethu.',
        '  6. Credit providers who do not respond within the prescribed period are deemed to have accepted.',
    ];
    for (const term of terms) {
        ensureSpace(14);
        page.drawText(term, { x: MARGIN, y, size: 8, font, color: DARK_GRAY });
        y -= 13;
    }
    y -= 10;

    // ── SECTION 5 — SIGNATURES ────────────────────────────────────────────────
    ensureSpace(90);
    y = drawSectionHeader(page, '5. ACCEPTANCE', y, bold, PAGE_W, MARGIN);
    y -= 20;

    page.drawText('Consumer Signature:', { x: MARGIN, y, size: 8, font: bold, color: DARK_GRAY });
    page.drawLine({ start: { x: MARGIN + 120, y }, end: { x: MARGIN + 300, y }, thickness: 0.8, color: DARK_GRAY });
    page.drawText('Date:', { x: MARGIN + 320, y, size: 8, font: bold, color: DARK_GRAY });
    page.drawLine({ start: { x: MARGIN + 350, y }, end: { x: CONTENT_W + MARGIN, y }, thickness: 0.8, color: DARK_GRAY });
    y -= 10;
    page.drawText(`Print Name: ${fullName}`, { x: MARGIN + 120, y, size: 7.5, font, color: MID_GRAY });
    y -= 30;

    page.drawText('Debt Counsellor:', { x: MARGIN, y, size: 8, font: bold, color: DARK_GRAY });
    page.drawLine({ start: { x: MARGIN + 120, y }, end: { x: MARGIN + 300, y }, thickness: 0.8, color: DARK_GRAY });
    page.drawText('Date:', { x: MARGIN + 320, y, size: 8, font: bold, color: DARK_GRAY });
    page.drawLine({ start: { x: MARGIN + 350, y }, end: { x: CONTENT_W + MARGIN, y }, thickness: 0.8, color: DARK_GRAY });
    y -= 10;
    page.drawText(`${data.dcName}  |  NCRDC: ${data.dcNcrdcNo}`, { x: MARGIN + 120, y, size: 7.5, font, color: MID_GRAY });

    // ── FOOTER ────────────────────────────────────────────────────────────────
    const pages = doc.getPages();
    for (let p = 0; p < pages.length; p++) {
        const pg = pages[p];
        pg.drawLine({ start: { x: MARGIN, y: 40 }, end: { x: PAGE_W - MARGIN, y: 40 }, thickness: 0.5, color: LIGHT_GRAY });
        pg.drawText(
            `Debt Restructuring Proposal — Section 86(7)(b) NCA 34 of 2005  |  File: ${data.fileNumber}  |  Generated: ${new Date().toLocaleDateString('en-ZA')}`,
            { x: MARGIN, y: 28, size: 6.5, font, color: MID_GRAY }
        );
        pg.drawText(`Page ${p + 1} of ${pages.length}`, {
            x: PAGE_W - MARGIN - 50, y: 28, size: 6.5, font, color: MID_GRAY
        });
    }

    return doc.save();
}
