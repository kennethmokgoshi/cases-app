import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';

// ── Colours (match Form 16/17 branding) ────────────────────────────────────────
const DARK_GRAY  = rgb(0.2,  0.2,  0.2);
const MID_GRAY   = rgb(0.5,  0.5,  0.5);
const LIGHT_GRAY = rgb(0.93, 0.93, 0.93);
const WHITE      = rgb(1,    1,    1);
const TEAL       = rgb(0,    0.47, 0.47);
const GREEN      = rgb(0.05, 0.5,  0.25);

export interface Form19Account {
    creditorName:       string;
    accountNumber:      string | null;
    accountType:        string;
    status:             string;
    outstandingBalance: number;
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
export async function generateForm19(data: Form19Data): Promise<Uint8Array> {
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
    page.drawText('CLEARANCE CERTIFICATE — SECTION 71(1)', {
        x: MARGIN, y: PAGE_H - 42, size: 10, font: bold, color: WHITE
    });
    page.drawText('FORM 19', {
        x: PAGE_W - 110, y: PAGE_H - 28, size: 16, font: bold, color: WHITE
    });

    const issueDate = data.issueDate.toLocaleDateString('en-ZA', {
        day: '2-digit', month: 'long', year: 'numeric'
    });
    page.drawText(`File No: ${data.fileNumber}`, {
        x: PAGE_W - 180, y: PAGE_H - 52, size: 8, font: bold, color: WHITE
    });
    page.drawText(`Date of Issue: ${issueDate}`, {
        x: PAGE_W - 180, y: PAGE_H - 64, size: 8, font, color: WHITE
    });

    y = PAGE_H - 95;

    // ── INTRO ─────────────────────────────────────────────────────────────────
    const intro = data.allObligationsSettled
        ? [
            'This Clearance Certificate is issued in terms of Section 71(1) of the National Credit Act 34 of',
            '2005. The debt counsellor certifies that the consumer named below has fully satisfied all of the',
            'consumer\'s obligations under every credit agreement that was subject to the debt re-arrangement.',
          ]
        : [
            'This Clearance Certificate is issued in terms of Section 71(1)(b) of the National Credit Act 34 of',
            '2005. The debt counsellor certifies that the consumer named below has satisfied all obligations',
            'under every credit agreement that was subject to the debt re-arrangement, OTHER THAN a credit',
            'agreement secured by a mortgage bond, in respect of which the consumer is maintaining payments.',
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
    y -= 36;

    // ── SECTION 3 — CREDIT AGREEMENTS ────────────────────────────────────────
    ensureSpace(60);
    y = drawSectionHeader(page, '3. CREDIT AGREEMENTS SUBJECT TO THE RE-ARRANGEMENT', y, bold, PAGE_W, MARGIN);
    y -= 8;

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

    for (let i = 0; i < data.accounts.length; i++) {
        ensureSpace(18);
        const acc = data.accounts[i];
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

    // ── SECTION 4 — CERTIFICATION ────────────────────────────────────────────
    ensureSpace(160);
    y = drawSectionHeader(page, '4. CERTIFICATION', y, bold, PAGE_W, MARGIN);
    y -= 14;

    page.drawText(
        data.allObligationsSettled
            ? 'ALL OBLIGATIONS UNDER THE RE-ARRANGED CREDIT AGREEMENTS HAVE BEEN SATISFIED'
            : 'ALL OBLIGATIONS SATISFIED EXCEPT THE MORTGAGE AGREEMENT — SECTION 71(1)(b)',
        { x: MARGIN, y, size: 9, font: bold, color: GREEN }
    );
    y -= 18;

    const certLines = [
        `I, ${data.dcName} (Registration No. ${data.dcNcrdcNo}), a debt counsellor registered in terms of`,
        'Section 44 of the National Credit Act, hereby certify that the information contained in this',
        'certificate is true and correct, and that this certificate is issued in terms of Section 71(1) of the',
        'Act read with Regulation 27.',
    ];
    if (!data.allObligationsSettled && data.mortgageCreditor) {
        certLines.push('', `The remaining credit agreement secured by a mortgage bond is held with ${data.mortgageCreditor},`,
            'in respect of which the consumer is maintaining the required payments.');
    }
    for (const line of certLines) {
        ensureSpace(14);
        page.drawText(line, { x: MARGIN, y, size: 8, font, color: DARK_GRAY });
        y -= 13;
    }
    y -= 20;

    // Signature + certification blocks
    ensureSpace(110);
    page.drawText('Signed by Debt Counsellor:', { x: MARGIN, y, size: 8, font: bold, color: DARK_GRAY });
    page.drawLine({ start: { x: MARGIN + 150, y }, end: { x: MARGIN + 330, y }, thickness: 0.8, color: DARK_GRAY });
    page.drawText('Date:', { x: MARGIN + 350, y, size: 8, font: bold, color: DARK_GRAY });
    page.drawLine({ start: { x: MARGIN + 380, y }, end: { x: CONTENT_W + MARGIN, y }, thickness: 0.8, color: DARK_GRAY });
    y -= 10;
    page.drawText(`${data.dcName}  |  NCRDC: ${data.dcNcrdcNo}`, { x: MARGIN + 150, y, size: 7.5, font, color: MID_GRAY });
    y -= 30;

    page.drawText('CERTIFICATION (Commissioner of Oaths / Certifying Officer):', {
        x: MARGIN, y, size: 8, font: bold, color: DARK_GRAY
    });
    y -= 16;
    page.drawText('I certify that this is a true copy of the original Form 19 Clearance Certificate.', {
        x: MARGIN, y, size: 8, font, color: DARK_GRAY
    });
    y -= 24;
    page.drawText('Full Name:', { x: MARGIN, y, size: 8, font: bold, color: DARK_GRAY });
    page.drawLine({ start: { x: MARGIN + 60, y }, end: { x: MARGIN + 240, y }, thickness: 0.8, color: DARK_GRAY });
    page.drawText('Signature:', { x: MARGIN + 260, y, size: 8, font: bold, color: DARK_GRAY });
    page.drawLine({ start: { x: MARGIN + 320, y }, end: { x: CONTENT_W + MARGIN, y }, thickness: 0.8, color: DARK_GRAY });
    y -= 20;
    page.drawText('Capacity:', { x: MARGIN, y, size: 8, font: bold, color: DARK_GRAY });
    page.drawLine({ start: { x: MARGIN + 60, y }, end: { x: MARGIN + 240, y }, thickness: 0.8, color: DARK_GRAY });
    page.drawText('Date:', { x: MARGIN + 260, y, size: 8, font: bold, color: DARK_GRAY });
    page.drawLine({ start: { x: MARGIN + 320, y }, end: { x: CONTENT_W + MARGIN, y }, thickness: 0.8, color: DARK_GRAY });

    // ── FOOTER ────────────────────────────────────────────────────────────────
    const pages = doc.getPages();
    for (let p = 0; p < pages.length; p++) {
        const pg = pages[p];
        pg.drawLine({ start: { x: MARGIN, y: 40 }, end: { x: PAGE_W - MARGIN, y: 40 }, thickness: 0.5, color: LIGHT_GRAY });
        pg.drawText(
            `Form 19 — Clearance Certificate  |  File: ${data.fileNumber}  |  Generated: ${new Date().toLocaleDateString('en-ZA')}`,
            { x: MARGIN, y: 28, size: 6.5, font, color: MID_GRAY }
        );
        pg.drawText(`Page ${p + 1} of ${pages.length}`, {
            x: PAGE_W - MARGIN - 50, y: 28, size: 6.5, font, color: MID_GRAY
        });
    }

    return doc.save();
}
