import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';

// ── Colours (match Form 16/17 branding) ────────────────────────────────────────
const DARK_GRAY  = rgb(0.2,  0.2,  0.2);
const MID_GRAY   = rgb(0.5,  0.5,  0.5);
const LIGHT_GRAY = rgb(0.93, 0.93, 0.93);
const WHITE      = rgb(1,    1,    1);
const TEAL       = rgb(0,    0.47, 0.47);
const GREEN      = rgb(0.05, 0.5,  0.25);

export interface Section7172Account {
    creditorName:       string;
    accountNumber:      string | null;
    accountType:        string;
    status:             string;
    outstandingBalance: number;
}

export interface Section7172StatementData {
    fileNumber:      string;
    statementDate:   Date;
    // Consumer
    firstName:       string;
    lastName:        string;
    idNumber:        string;
    address:         string | null;
    // Settled agreements
    settledAccounts: Section7172Account[];
    // Remaining mortgage (payments being maintained)
    mortgageCreditor:      string | null;
    mortgageAccountNumber: string | null;
    mortgageBalance:       number | null;
    mortgageInstalment:    number | null;
    /** Where the not-in-arrears evidence comes from, e.g. "Credit bureau report" / "Statement of account". */
    mortgageEvidenceSource: string | null;
    // DC details
    dcName:          string;
    dcNcrdcNo:       string;
    dcAddress:       string;
    dcPhone:         string;
    dcEmail:         string;
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
export async function generateSection7172Statement(data: Section7172StatementData): Promise<Uint8Array> {
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
    page.drawText('STATEMENT IN TERMS OF SECTIONS 71(1)(b) AND 72', {
        x: MARGIN, y: PAGE_H - 42, size: 10, font: bold, color: WHITE
    });

    const stmtDate = data.statementDate.toLocaleDateString('en-ZA', {
        day: '2-digit', month: 'long', year: 'numeric'
    });
    page.drawText(`File No: ${data.fileNumber}`, {
        x: PAGE_W - 180, y: PAGE_H - 56, size: 8, font: bold, color: WHITE
    });
    page.drawText(`Date: ${stmtDate}`, {
        x: PAGE_W - 180, y: PAGE_H - 68, size: 8, font, color: WHITE
    });

    y = PAGE_H - 95;

    // ── INTRO ─────────────────────────────────────────────────────────────────
    const intro = [
        'This statement is made in terms of Section 71(1)(b) of the National Credit Act 34 of 2005, read',
        'with Section 72 (right to access and challenge credit records and information). It records that the',
        'consumer has satisfied all obligations under every credit agreement that was subject to the debt',
        're-arrangement, other than a credit agreement secured by a mortgage bond, and that the mortgage',
        'account is not in arrears.',
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
    labelValue(page, 'Address', fmt(data.address), MARGIN, y, font, bold, 460);
    y -= 36;

    // ── SECTION 2 — SETTLED AGREEMENTS ───────────────────────────────────────
    ensureSpace(60);
    y = drawSectionHeader(page, '2. SETTLED CREDIT AGREEMENTS', y, bold, PAGE_W, MARGIN);
    y -= 8;

    if (data.settledAccounts.length === 0) {
        page.drawText('No settled credit agreements are recorded on the case.', {
            x: MARGIN, y, size: 8, font, color: MID_GRAY
        });
        y -= 20;
    } else {
        const cols = {
            no:       { x: MARGIN       },
            creditor: { x: MARGIN + 26  },
            accNo:    { x: MARGIN + 190 },
            type:     { x: MARGIN + 290 },
            status:   { x: MARGIN + 375 },
            balance:  { x: MARGIN + 440 },
        };

        page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_W, height: 15, color: LIGHT_GRAY });
        const headers: [string, number][] = [
            ['#', cols.no.x], ['Credit Provider', cols.creditor.x],
            ['Account Number', cols.accNo.x], ['Type', cols.type.x],
            ['Status', cols.status.x], ['Balance', cols.balance.x],
        ];
        for (const [h, hx] of headers) {
            page.drawText(h, { x: hx, y: y - 2, size: 7, font: bold, color: DARK_GRAY });
        }
        y -= 18;

        for (let i = 0; i < data.settledAccounts.length; i++) {
            ensureSpace(18);
            const acc = data.settledAccounts[i];
            const rowColor = i % 2 === 0 ? WHITE : rgb(0.97, 0.97, 0.97);
            page.drawRectangle({ x: MARGIN, y: y - 3, width: CONTENT_W, height: 14, color: rowColor });

            const row: [string, number][] = [
                [`${i + 1}`, cols.no.x],
                [acc.creditorName.substring(0, 28), cols.creditor.x],
                [fmt(acc.accountNumber, '—').substring(0, 18), cols.accNo.x],
                [acc.accountType.replace('_', ' ').substring(0, 14), cols.type.x],
                [acc.status.substring(0, 10), cols.status.x],
                [zar(acc.outstandingBalance), cols.balance.x],
            ];
            for (const [val, vx] of row) {
                page.drawText(val, { x: vx, y, size: 7.5, font, color: DARK_GRAY });
            }
            y -= 16;
        }
        y -= 10;
    }

    // ── SECTION 3 — MORTGAGE POSITION ────────────────────────────────────────
    ensureSpace(110);
    y = drawSectionHeader(page, '3. MORTGAGE AGREEMENT — NOT IN ARREARS', y, bold, PAGE_W, MARGIN);
    y -= 10;

    labelValue(page, 'Mortgage Credit Provider', fmt(data.mortgageCreditor, '—'), MARGIN, y, font, bold);
    labelValue(page, 'Account Number', fmt(data.mortgageAccountNumber, '—'), MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(page, 'Outstanding Balance', zar(data.mortgageBalance), MARGIN, y, font, bold);
    labelValue(page, 'Monthly Instalment (Maintained)', zar(data.mortgageInstalment), MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(
        page, 'Evidence That the Mortgage Is Not in Arrears',
        fmt(data.mortgageEvidenceSource, 'Statement of account / credit bureau report on the case file'),
        MARGIN, y, font, bold, 460
    );
    y -= 40;

    // ── SECTION 4 — STATEMENT ────────────────────────────────────────────────
    ensureSpace(140);
    y = drawSectionHeader(page, '4. STATEMENT', y, bold, PAGE_W, MARGIN);
    y -= 14;

    page.drawText('SECTION 71(1)(b) POSITION CONFIRMED — MORTGAGE NOT IN ARREARS', {
        x: MARGIN, y, size: 9, font: bold, color: GREEN
    });
    y -= 18;

    const statement = [
        `I, ${data.dcName} (Registration No. ${data.dcNcrdcNo}), a registered debt counsellor, state that:`,
        '',
        '1.  The consumer has satisfied all obligations under every credit agreement that was subject to the',
        '    debt re-arrangement, other than the mortgage agreement referred to in Section 3 above, as',
        '    contemplated in Section 71(1)(b) of the Act.',
        '2.  The mortgage agreement is not in arrears and the consumer is maintaining the required payments,',
        '    as evidenced by the source recorded in Section 3.',
        '3.  In terms of Section 72 of the Act, the consumer is entitled to have this information reflected',
        '    correctly by every registered credit bureau, and the credit bureaus are requested to update the',
        '    consumer\'s records accordingly upon receipt of the certified Form 19 Clearance Certificate.',
    ];
    for (const line of statement) {
        ensureSpace(14);
        page.drawText(line, { x: MARGIN, y, size: 8, font, color: DARK_GRAY });
        y -= 13;
    }
    y -= 16;

    // ── SECTION 5 — SIGNATURE ────────────────────────────────────────────────
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
            `Statement — Sections 71(1)(b) & 72  |  File: ${data.fileNumber}  |  Generated: ${new Date().toLocaleDateString('en-ZA')}`,
            { x: MARGIN, y: 28, size: 6.5, font, color: MID_GRAY }
        );
        pg.drawText(`Page ${p + 1} of ${pages.length}`, {
            x: PAGE_W - MARGIN - 50, y: 28, size: 6.5, font, color: MID_GRAY
        });
    }

    return doc.save();
}
