import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';

// ── Colours (match Form 16/17 branding) ────────────────────────────────────────
const DARK_GRAY  = rgb(0.2,  0.2,  0.2);
const MID_GRAY   = rgb(0.5,  0.5,  0.5);
const LIGHT_GRAY = rgb(0.93, 0.93, 0.93);
const WHITE      = rgb(1,    1,    1);
const TEAL       = rgb(0,    0.47, 0.47);

export interface FurnishedDocumentRow {
    type:       string;      // Document.type, e.g. 'ID', 'PAYSLIP', 'BANK_STATEMENT'
    fileName:   string;
    uploadedAt: Date;
}

export interface ConsumerInfoRecordData {
    fileNumber:              string;
    recordDate:              Date;
    applicationDate:         Date;
    // Consumer personal information furnished
    firstName:               string;
    lastName:                string;
    idNumber:                string;
    email:                   string | null;
    phone:                   string | null;
    address:                 string | null;
    // Employment & income information furnished
    employer:                string | null;
    employeeNo:              string | null;
    grossSalary:             number | null;
    netSalary:               number | null;
    // Credit information furnished
    creditAccountCount:      number;
    totalOutstandingBalance: number;
    totalMonthlyInstalment:  number;
    // Documents furnished
    documents:               FurnishedDocumentRow[];
    // DC details
    dcName:                  string;
    dcNcrdcNo:               string;
    dcAddress:               string;
    dcPhone:                 string;
    dcEmail:                 string;
}

// Friendly labels for Document.type values shown in the furnished-documents table.
const DOC_TYPE_LABELS: Record<string, string> = {
    ID:                    'Identity Document',
    POA:                   'Power of Attorney',
    ZENOWETHU_POA:         'Zenowethu Power of Attorney',
    CREDIT_REPORT:         'Credit Bureau Report',
    CREDIT_REPORT_OTHER:   'Credit Bureau Report (Additional)',
    PAYSLIP:               'Payslip',
    BANK_STATEMENT:        'Bank Statement',
    PROOF_OF_RESIDENCE:    'Proof of Residence',
    DHS_SUMMARY_REPORT:    'DHS Summary Report',
    COMBINED:              'Combined Application Bundle',
    OTHER:                 'Other Supporting Document',
};

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
export async function generateConsumerInfoRecord(data: ConsumerInfoRecordData): Promise<Uint8Array> {
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

    page.drawText('NATIONAL CREDIT ACT 34 OF 2005 — DEBT REVIEW APPLICATION', {
        x: MARGIN, y: PAGE_H - 28, size: 9, font: bold, color: WHITE
    });
    page.drawText('RECORD OF CONSUMER INFORMATION FURNISHED', {
        x: MARGIN, y: PAGE_H - 42, size: 10, font: bold, color: WHITE
    });

    const recDate = data.recordDate.toLocaleDateString('en-ZA', {
        day: '2-digit', month: 'long', year: 'numeric'
    });
    page.drawText(`File No: ${data.fileNumber}`, {
        x: PAGE_W - 180, y: PAGE_H - 56, size: 8, font: bold, color: WHITE
    });
    page.drawText(`Date: ${recDate}`, {
        x: PAGE_W - 180, y: PAGE_H - 68, size: 8, font, color: WHITE
    });

    y = PAGE_H - 95;

    // ── INTRO ─────────────────────────────────────────────────────────────────
    const intro = [
        'This document records the information and supporting documentation furnished by the consumer to',
        'the debt counsellor in support of the consumer\'s application for debt review in terms of Section',
        '86(1) of the National Credit Act, and forms part of the consumer\'s case file.',
    ];
    for (const line of intro) {
        page.drawText(line, { x: MARGIN, y, size: 8, font, color: DARK_GRAY });
        y -= 13;
    }
    y -= 8;

    // ── SECTION 1 — PERSONAL INFORMATION ─────────────────────────────────────
    y = drawSectionHeader(page, '1. PERSONAL INFORMATION FURNISHED', y, bold, PAGE_W, MARGIN);
    y -= 10;

    const appDate = data.applicationDate.toLocaleDateString('en-ZA', {
        day: '2-digit', month: 'long', year: 'numeric'
    });

    labelValue(page, 'Full Name', fmt(`${data.firstName} ${data.lastName}`), MARGIN, y, font, bold);
    labelValue(page, 'SA Identity Number', fmt(data.idNumber), MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(page, 'Address', fmt(data.address), MARGIN, y, font, bold, 460);
    y -= 32;
    labelValue(page, 'Cell / Telephone', fmt(data.phone), MARGIN, y, font, bold);
    labelValue(page, 'Email Address', fmt(data.email), MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(page, 'Date of Debt Review Application', appDate, MARGIN, y, font, bold);
    y -= 36;

    // ── SECTION 2 — EMPLOYMENT & INCOME ──────────────────────────────────────
    y = drawSectionHeader(page, '2. EMPLOYMENT & INCOME INFORMATION FURNISHED', y, bold, PAGE_W, MARGIN);
    y -= 10;

    labelValue(page, 'Employer', fmt(data.employer, '—'), MARGIN, y, font, bold);
    labelValue(page, 'Employee / Persal Number', fmt(data.employeeNo, '—'), MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(page, 'Gross Monthly Income', data.grossSalary != null ? zar(data.grossSalary) : '—', MARGIN, y, font, bold);
    labelValue(page, 'Net Monthly Income', data.netSalary != null ? zar(data.netSalary) : '—', MARGIN + 260, y, font, bold);
    y -= 36;

    // ── SECTION 3 — CREDIT INFORMATION ───────────────────────────────────────
    y = drawSectionHeader(page, '3. CREDIT INFORMATION FURNISHED', y, bold, PAGE_W, MARGIN);
    y -= 10;

    labelValue(page, 'Credit Accounts Disclosed', String(data.creditAccountCount), MARGIN, y, font, bold);
    labelValue(page, 'Total Outstanding Balance', zar(data.totalOutstandingBalance), MARGIN + 260, y, font, bold);
    y -= 32;
    labelValue(page, 'Total Monthly Instalments', zar(data.totalMonthlyInstalment), MARGIN, y, font, bold);
    y -= 36;

    // ── SECTION 4 — DOCUMENTS FURNISHED ──────────────────────────────────────
    ensureSpace(60);
    y = drawSectionHeader(page, '4. DOCUMENTS FURNISHED BY THE CONSUMER', y, bold, PAGE_W, MARGIN);
    y -= 8;

    if (data.documents.length === 0) {
        page.drawText('No analysed documents are on record for this case.', {
            x: MARGIN, y, size: 8, font, color: MID_GRAY
        });
        y -= 20;
    } else {
        const cols = {
            no:       { x: MARGIN       },
            type:     { x: MARGIN + 26  },
            fileName: { x: MARGIN + 220 },
            date:     { x: MARGIN + 430 },
        };

        page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_W, height: 15, color: LIGHT_GRAY });
        const headers: [string, number][] = [
            ['#', cols.no.x], ['Document Type', cols.type.x],
            ['File Name', cols.fileName.x], ['Date Furnished', cols.date.x],
        ];
        for (const [h, hx] of headers) {
            page.drawText(h, { x: hx, y: y - 2, size: 7, font: bold, color: DARK_GRAY });
        }
        y -= 18;

        for (let i = 0; i < data.documents.length; i++) {
            ensureSpace(18);
            const d = data.documents[i];
            const rowColor = i % 2 === 0 ? WHITE : rgb(0.97, 0.97, 0.97);
            page.drawRectangle({ x: MARGIN, y: y - 3, width: CONTENT_W, height: 14, color: rowColor });

            const row: [string, number][] = [
                [`${i + 1}`, cols.no.x],
                [(DOC_TYPE_LABELS[d.type] ?? d.type.replace(/_/g, ' ')).substring(0, 36), cols.type.x],
                [d.fileName.substring(0, 40), cols.fileName.x],
                [d.uploadedAt.toLocaleDateString('en-ZA'), cols.date.x],
            ];
            for (const [val, vx] of row) {
                page.drawText(val, { x: vx, y, size: 7.5, font, color: DARK_GRAY });
            }
            y -= 16;
        }
        y -= 8;
    }

    // ── SECTION 5 — DECLARATION & SIGNATURES ─────────────────────────────────
    ensureSpace(150);
    y = drawSectionHeader(page, '5. DECLARATION', y, bold, PAGE_W, MARGIN);
    y -= 14;

    const declaration = [
        'The consumer declares that the information and documents recorded above were furnished to the',
        'debt counsellor and are, to the best of the consumer\'s knowledge, true, complete and correct.',
        'The debt counsellor confirms that this record reflects the information received from the consumer',
        'and relied upon in the assessment of the consumer\'s application.',
    ];
    for (const line of declaration) {
        ensureSpace(14);
        page.drawText(line, { x: MARGIN, y, size: 8, font, color: DARK_GRAY });
        y -= 13;
    }
    y -= 20;

    ensureSpace(90);
    page.drawText('Signed by Consumer:', { x: MARGIN, y, size: 8, font: bold, color: DARK_GRAY });
    page.drawLine({ start: { x: MARGIN + 150, y }, end: { x: MARGIN + 330, y }, thickness: 0.8, color: DARK_GRAY });
    page.drawText('Date:', { x: MARGIN + 350, y, size: 8, font: bold, color: DARK_GRAY });
    page.drawLine({ start: { x: MARGIN + 380, y }, end: { x: CONTENT_W + MARGIN, y }, thickness: 0.8, color: DARK_GRAY });
    y -= 10;
    page.drawText(`${data.firstName} ${data.lastName}  |  ID: ${data.idNumber}`, {
        x: MARGIN + 150, y, size: 7.5, font, color: MID_GRAY
    });
    y -= 34;

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
            `Record of Consumer Information Furnished  |  File: ${data.fileNumber}  |  Generated: ${new Date().toLocaleDateString('en-ZA')}`,
            { x: MARGIN, y: 28, size: 6.5, font, color: MID_GRAY }
        );
        pg.drawText(`Page ${p + 1} of ${pages.length}`, {
            x: PAGE_W - MARGIN - 50, y: 28, size: 6.5, font, color: MID_GRAY
        });
    }

    return doc.save();
}
