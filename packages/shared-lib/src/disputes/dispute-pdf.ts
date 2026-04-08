import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage, RGB } from 'pdf-lib';
import { logger } from '../logger';

// ---------------------------------------------------------------------------
// Zenowethu Company Details (NCA-compliant letterhead)
// ---------------------------------------------------------------------------

const ZENOWETHU = {
    name: 'Zenowethu Debt Management (PTY) LTD',
    regNo: '2013/121120/07',
    ncrdc: 'NCRDC3693',
    dcasa: '0863',
    address: 'Suite 2, Second Floor, Central House, 17 Central Road, Mabopane, 0199',
    phone: '012 035 1824',
    email: 'info@zenowethu.co.za',
};

// ---------------------------------------------------------------------------
// Colour palette
// ---------------------------------------------------------------------------

const DARK   = rgb(0.12, 0.12, 0.12);
const MID    = rgb(0.45, 0.45, 0.45);
const LIGHT  = rgb(0.93, 0.93, 0.93);
const WHITE  = rgb(1, 1, 1);
const TEAL   = rgb(0, 0.47, 0.47);
const RED    = rgb(0.75, 0.1, 0.1);

// ---------------------------------------------------------------------------
// Dispute Letter Types
// ---------------------------------------------------------------------------

export type DisputeLetterType =
    | 'CREDIT_BUREAU_DISPUTE'        // A — To credit bureau
    | 'CREDIT_PROVIDER_DISPUTE'      // B — To credit provider
    | 'SECTION_129_DEMAND'           // C — Section 129 compliance demand
    | 'SETTLEMENT_NEGOTIATION'       // D — Settlement negotiation
    | 'PAID_UP_REQUEST'              // E — Paid-up confirmation request
    | 'PRESCRIBED_DEBT_NOTICE';      // F — Prescribed debt notice

export interface DisputeLetterInput {
    // Client
    clientFullName: string;
    clientIdNumber: string;
    clientAddress?: string;
    clientCellNumber?: string;
    // Account being disputed
    creditorName: string;
    accountNumber: string;
    outstandingBalance?: number;
    overdueBalance?: number;
    adverseCode?: string;         // e.g. "Handed Over", "Written Off"
    adverseDate?: string;         // YYYY-MM-DD
    lastPaymentDate?: string;     // YYYY-MM-DD
    // Document targets
    bureauName?: string;          // e.g. "Experian", "TransUnion", "XDS"
    disputeGrounds: string[];     // List of grounds (from classification)
    // For settlement letter
    settlementOfferPercent?: number;  // e.g. 40 (= 40% of outstanding)
    settlementAmount?: number;
    // Consultant signing
    consultantName?: string;
    consultantTitle?: string;
    // Auto-generated
    referenceNumber?: string;
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

const MARGIN = 55;
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function newRef(): string {
    const now = new Date();
    return `ZDM-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function zarFormat(amount: number): string {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(amount);
}

function formatDate(iso?: string): string {
    if (!iso || iso === 'NA') return 'Not on record';
    try {
        return new Date(iso).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
    } catch {
        return iso;
    }
}

function todayFormatted(): string {
    return new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Draw letterhead
// ---------------------------------------------------------------------------

function drawLetterhead(page: PDFPage, boldFont: PDFFont, regularFont: PDFFont): number {
    // Teal header bar
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 72, width: PAGE_WIDTH, height: 72, color: TEAL });

    // Company name
    page.drawText(ZENOWETHU.name, { x: MARGIN, y: PAGE_HEIGHT - 30, size: 13, font: boldFont, color: WHITE });
    page.drawText(`NCR Reg: ${ZENOWETHU.ncrdc}  |  DCASA: ${ZENOWETHU.dcasa}  |  Co. Reg: ${ZENOWETHU.regNo}`, {
        x: MARGIN, y: PAGE_HEIGHT - 46, size: 7.5, font: regularFont, color: WHITE,
    });
    page.drawText(`${ZENOWETHU.address}  |  ${ZENOWETHU.phone}  |  ${ZENOWETHU.email}`, {
        x: MARGIN, y: PAGE_HEIGHT - 60, size: 7, font: regularFont, color: WHITE,
    });

    return PAGE_HEIGHT - 90; // top of content area
}

// ---------------------------------------------------------------------------
// Draw footer
// ---------------------------------------------------------------------------

function drawFooter(page: PDFPage, regularFont: PDFFont, pageNum: number, totalPages: number): void {
    page.drawLine({ start: { x: MARGIN, y: 42 }, end: { x: PAGE_WIDTH - MARGIN, y: 42 }, thickness: 0.5, color: LIGHT });
    page.drawText('DRAFT — For review by authorized consultant before sending', {
        x: MARGIN, y: 28, size: 7, font: regularFont, color: RED,
    });
    page.drawText(`This is credit repair assistance, not legal advice. For legal proceedings, consult a qualified attorney.`, {
        x: MARGIN, y: 18, size: 6.5, font: regularFont, color: MID,
    });
    page.drawText(`Page ${pageNum} of ${totalPages}`, {
        x: PAGE_WIDTH - MARGIN - 50, y: 28, size: 7, font: regularFont, color: MID,
    });
}

// ---------------------------------------------------------------------------
// Wrap text into lines that fit a given width
// ---------------------------------------------------------------------------

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        const w = font.widthOfTextAtSize(candidate, fontSize);
        if (w > maxWidth && current) {
            lines.push(current);
            current = word;
        } else {
            current = candidate;
        }
    }
    if (current) lines.push(current);
    return lines;
}

// ---------------------------------------------------------------------------
// Text block renderer — returns new y position
// ---------------------------------------------------------------------------

interface TextBlockOptions {
    font?: PDFFont;
    size?: number;
    color?: RGB;
    lineSpacing?: number;
    indent?: number;
}

function drawTextBlock(
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    boldFont: PDFFont,
    regularFont: PDFFont,
    opts: TextBlockOptions = {}
): number {
    const font = opts.font || regularFont;
    const size = opts.size || 9.5;
    const color = opts.color || DARK;
    const spacing = opts.lineSpacing ?? 14;
    const indent = opts.indent ?? 0;

    const lines = wrapText(text, font, size, maxWidth - indent);
    for (const line of lines) {
        page.drawText(line, { x: x + indent, y, size, font, color });
        y -= spacing;
    }
    return y;
}

// ---------------------------------------------------------------------------
// Section heading
// ---------------------------------------------------------------------------

function drawSectionHeading(page: PDFPage, text: string, y: number, boldFont: PDFFont): number {
    page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_WIDTH, height: 18, color: TEAL });
    page.drawText(text.toUpperCase(), { x: MARGIN + 8, y: y + 1, size: 8.5, font: boldFont, color: WHITE });
    return y - 26;
}

// ---------------------------------------------------------------------------
// Address block (sender + recipient)
// ---------------------------------------------------------------------------

function drawAddressBlock(
    page: PDFPage,
    recipient: string[],
    date: string,
    ref: string,
    y: number,
    regularFont: PDFFont,
    boldFont: PDFFont
): number {
    // Sender address (left column)
    page.drawText(ZENOWETHU.name, { x: MARGIN, y, size: 8.5, font: boldFont, color: DARK });
    y -= 13;
    page.drawText(ZENOWETHU.address, { x: MARGIN, y, size: 8, font: regularFont, color: MID });
    y -= 12;
    page.drawText(`Tel: ${ZENOWETHU.phone}  |  Email: ${ZENOWETHU.email}`, { x: MARGIN, y, size: 8, font: regularFont, color: MID });

    // Date + ref on right
    const rightX = MARGIN + CONTENT_WIDTH / 2;
    let ry = y + 25;
    page.drawText(`Date: ${date}`, { x: rightX, y: ry, size: 8.5, font: regularFont, color: DARK });
    ry -= 13;
    page.drawText(`Our Ref: ${ref}`, { x: rightX, y: ry, size: 8.5, font: regularFont, color: DARK });

    y -= 24;

    // Recipient
    page.drawText('To:', { x: MARGIN, y, size: 8.5, font: boldFont, color: DARK });
    y -= 13;
    for (const line of recipient) {
        page.drawText(line, { x: MARGIN, y, size: 8.5, font: regularFont, color: DARK });
        y -= 12;
    }

    return y - 10;
}

// ---------------------------------------------------------------------------
// Signature block
// ---------------------------------------------------------------------------

function drawSignatureBlock(page: PDFPage, consultantName: string, consultantTitle: string, y: number, regularFont: PDFFont, boldFont: PDFFont): number {
    y -= 8;
    page.drawText('Yours faithfully,', { x: MARGIN, y, size: 9.5, font: regularFont, color: DARK });
    y -= 40; // space for physical signature
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 160, y }, thickness: 0.5, color: MID });
    y -= 13;
    page.drawText(consultantName, { x: MARGIN, y, size: 9.5, font: boldFont, color: DARK });
    y -= 12;
    page.drawText(consultantTitle, { x: MARGIN, y, size: 8.5, font: regularFont, color: MID });
    y -= 12;
    page.drawText(ZENOWETHU.name, { x: MARGIN, y, size: 8.5, font: regularFont, color: MID });
    y -= 12;
    page.drawText(`NCR Reg: ${ZENOWETHU.ncrdc}`, { x: MARGIN, y, size: 8, font: regularFont, color: MID });
    return y;
}

// ---------------------------------------------------------------------------
// Attachment list
// ---------------------------------------------------------------------------

function drawAttachmentList(page: PDFPage, attachments: string[], y: number, regularFont: PDFFont, boldFont: PDFFont): number {
    y -= 10;
    page.drawText('Attachments:', { x: MARGIN, y, size: 9.5, font: boldFont, color: DARK });
    y -= 14;
    for (const att of attachments) {
        page.drawText(`• ${att}`, { x: MARGIN + 12, y, size: 9, font: regularFont, color: DARK });
        y -= 13;
    }
    return y;
}

// ---------------------------------------------------------------------------
// LETTER A — Credit Bureau Dispute Letter
// ---------------------------------------------------------------------------

async function generateCreditBureauDisputeLetter(input: DisputeLetterInput): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const ref = input.referenceNumber || newRef();
    const date = todayFormatted();
    const bureau = input.bureauName || 'The Credit Bureau';

    let y = drawLetterhead(page, boldFont, regularFont);
    y -= 10;

    y = drawAddressBlock(
        page,
        [bureau, 'Credit Bureau Dispute Department', 'South Africa'],
        date,
        ref,
        y,
        regularFont,
        boldFont
    );

    // Subject
    page.drawText(`RE: FORMAL CREDIT BUREAU DISPUTE — ${input.clientFullName} — ID: ${input.clientIdNumber}`, {
        x: MARGIN, y, size: 10, font: boldFont, color: DARK,
    });
    y -= 8;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: TEAL });
    y -= 18;

    // Opening
    y = drawTextBlock(page,
        `We write to you on behalf of our client, ${input.clientFullName} (South African ID Number: ${input.clientIdNumber}), pursuant to Section 72(1)(b) and Section 72(1)(c) of the National Credit Act 34 of 2005 (NCA) and Regulation 17 of the Credit Bureau Regulations thereunder.`,
        MARGIN, y, CONTENT_WIDTH, boldFont, regularFont);
    y -= 8;

    y = drawTextBlock(page,
        `Our client instructs us to formally dispute the following listing reflected on their credit profile held at ${bureau}:`,
        MARGIN, y, CONTENT_WIDTH, boldFont, regularFont);
    y -= 14;

    // Account details box
    y = drawSectionHeading(page, 'Account Under Dispute', y, boldFont);
    const rows: [string, string][] = [
        ['Credit Provider:', input.creditorName],
        ['Account Number:', input.accountNumber],
        ['Adverse Code:', input.adverseCode || 'NA'],
        ['Adverse Date:', formatDate(input.adverseDate)],
        ['Last Payment Date:', formatDate(input.lastPaymentDate)],
        ['Outstanding Balance:', input.outstandingBalance ? zarFormat(input.outstandingBalance) : 'NA'],
    ];
    for (const [label, value] of rows) {
        page.drawText(label, { x: MARGIN + 8, y, size: 9, font: boldFont, color: MID });
        page.drawText(value, { x: MARGIN + 180, y, size: 9, font: regularFont, color: DARK });
        y -= 14;
    }
    y -= 6;

    // Grounds
    y = drawSectionHeading(page, 'Grounds for Dispute', y, boldFont);
    for (let i = 0; i < input.disputeGrounds.length; i++) {
        y = drawTextBlock(page, `${i + 1}. ${input.disputeGrounds[i]}`, MARGIN + 8, y, CONTENT_WIDTH - 8, boldFont, regularFont);
        y -= 4;
    }
    y -= 6;

    // Relief sought
    y = drawSectionHeading(page, 'Relief Sought', y, boldFont);
    y = drawTextBlock(page,
        `We hereby request that ${bureau} conducts a full investigation into this listing in terms of Regulation 17 of the Credit Bureau Regulations and provides us with the following within 20 business days:`,
        MARGIN + 8, y, CONTENT_WIDTH - 8, boldFont, regularFont);
    y -= 8;
    const relief = [
        'Full details of the original credit agreement and verification of accuracy of the listing',
        'Confirmation of Section 129 notice compliance by the credit provider',
        'Immediate correction or removal of the disputed listing pending investigation',
        'Written confirmation of the outcome of the investigation',
    ];
    for (const r of relief) {
        y = drawTextBlock(page, `• ${r}`, MARGIN + 12, y, CONTENT_WIDTH - 12, boldFont, regularFont, { size: 9 });
        y -= 4;
    }
    y -= 10;

    // POPIA note
    y = drawTextBlock(page,
        `Please note that all information contained herein is provided subject to the Protection of Personal Information Act 4 of 2013 (POPIA). A valid Power of Attorney authorising Zenowethu Debt Management (PTY) LTD to act on behalf of the above-named consumer is on file and available on request.`,
        MARGIN, y, CONTENT_WIDTH, boldFont, regularFont, { size: 8.5, color: MID });
    y -= 16;

    y = drawSignatureBlock(page,
        input.consultantName || 'Authorised Consultant',
        input.consultantTitle || 'Credit Repair Consultant',
        y, regularFont, boldFont);
    y -= 10;

    drawAttachmentList(page, [
        'Certified copy of South African Identity Document',
        'Signed Power of Attorney (Zenowethu template)',
        'Recent Proof of Residence (not older than 3 months)',
        `Credit Bureau Report reflecting disputed listing (${input.bureauName || 'Bureau'})`,
    ], y, regularFont, boldFont);

    drawFooter(page, regularFont, 1, 1);

    return pdfDoc.save();
}

// ---------------------------------------------------------------------------
// LETTER B — Credit Provider Dispute Letter
// ---------------------------------------------------------------------------

async function generateCreditProviderDisputeLetter(input: DisputeLetterInput): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const ref = input.referenceNumber || newRef();
    const date = todayFormatted();

    let y = drawLetterhead(page, boldFont, regularFont);
    y -= 10;

    y = drawAddressBlock(
        page,
        [input.creditorName, 'Legal / Compliance Department', 'South Africa'],
        date,
        ref,
        y,
        regularFont,
        boldFont
    );

    page.drawText(`RE: FORMAL DISPUTE — NCA SECTION 72 — ${input.clientFullName} — ACCT: ${input.accountNumber}`, {
        x: MARGIN, y, size: 10, font: boldFont, color: DARK,
    });
    y -= 8;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: TEAL });
    y -= 18;

    y = drawTextBlock(page,
        `We act on behalf of ${input.clientFullName} (ID: ${input.clientIdNumber}) under duly executed Power of Attorney. Pursuant to Section 72(1)(b) and Section 72(1)(c) of the National Credit Act 34 of 2005, we hereby formally dispute the accuracy and/or validity of the credit bureau listing reported by your institution in respect of the account referenced herein.`,
        MARGIN, y, CONTENT_WIDTH, boldFont, regularFont);
    y -= 14;

    y = drawSectionHeading(page, 'Disputed Account Details', y, boldFont);
    const rows: [string, string][] = [
        ['Account Holder:', input.clientFullName],
        ['ID Number:', input.clientIdNumber],
        ['Account Number:', input.accountNumber],
        ['Adverse Classification:', input.adverseCode || 'NA'],
        ['Date of Adverse Listing:', formatDate(input.adverseDate)],
        ['Last Payment Date:', formatDate(input.lastPaymentDate)],
        ['Outstanding Balance:', input.outstandingBalance ? zarFormat(input.outstandingBalance) : 'NA'],
    ];
    for (const [label, value] of rows) {
        page.drawText(label, { x: MARGIN + 8, y, size: 9, font: boldFont, color: MID });
        page.drawText(value, { x: MARGIN + 190, y, size: 9, font: regularFont, color: DARK });
        y -= 14;
    }
    y -= 6;

    y = drawSectionHeading(page, 'Grounds for Dispute', y, boldFont);
    for (let i = 0; i < input.disputeGrounds.length; i++) {
        y = drawTextBlock(page, `${i + 1}. ${input.disputeGrounds[i]}`, MARGIN + 8, y, CONTENT_WIDTH - 8, boldFont, regularFont);
        y -= 4;
    }
    y -= 8;

    y = drawSectionHeading(page, 'Demands', y, boldFont);
    const demands = [
        'Provide documentary evidence confirming the validity of the adverse listing within 20 business days.',
        'Provide proof that a Section 129 NCA notice was delivered to our client prior to any adverse action being taken.',
        'Provide a complete statement of account for the disputed account.',
        'Suspend any collection action on the disputed amount pending resolution of this dispute.',
    ];
    for (const d of demands) {
        y = drawTextBlock(page, `• ${d}`, MARGIN + 12, y, CONTENT_WIDTH - 12, boldFont, regularFont, { size: 9 });
        y -= 5;
    }
    y -= 10;

    y = drawTextBlock(page,
        `Failure to respond within 20 business days will be deemed an admission that the listing is inaccurate or unlawful, and we will proceed accordingly, including referral to the National Credit Regulator (NCR) and the relevant Credit Bureau Ombud.`,
        MARGIN, y, CONTENT_WIDTH, boldFont, regularFont, { size: 9 });
    y -= 16;

    y = drawSignatureBlock(page,
        input.consultantName || 'Authorised Consultant',
        input.consultantTitle || 'Credit Repair Consultant',
        y, regularFont, boldFont);
    y -= 10;

    drawAttachmentList(page, [
        'Certified copy of client Identity Document',
        'Signed Power of Attorney',
        'Credit bureau report reflecting the disputed listing',
    ], y, regularFont, boldFont);

    drawFooter(page, regularFont, 1, 1);
    return pdfDoc.save();
}

// ---------------------------------------------------------------------------
// LETTER C — Section 129 Compliance Demand
// ---------------------------------------------------------------------------

async function generateSection129Demand(input: DisputeLetterInput): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const ref = input.referenceNumber || newRef();

    let y = drawLetterhead(page, boldFont, regularFont);
    y -= 10;

    y = drawAddressBlock(
        page,
        [input.creditorName, 'Legal / Compliance Department', 'South Africa'],
        todayFormatted(), ref, y, regularFont, boldFont
    );

    page.drawText(`RE: SECTION 129 COMPLIANCE DEMAND — NCA 34 OF 2005 — ACCT: ${input.accountNumber}`, {
        x: MARGIN, y, size: 10, font: boldFont, color: DARK,
    });
    y -= 8;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: TEAL });
    y -= 18;

    y = drawTextBlock(page,
        `We act on behalf of ${input.clientFullName} (ID: ${input.clientIdNumber}) and write to you pursuant to Section 129 of the National Credit Act 34 of 2005 (NCA).`,
        MARGIN, y, CONTENT_WIDTH, boldFont, regularFont);
    y -= 12;

    y = drawTextBlock(page,
        `Section 129(1)(a) of the NCA requires a credit provider to deliver a Section 129 notice to a consumer before taking any steps to enforce a credit agreement, including the listing of adverse information with a credit bureau. Our client asserts that NO such notice was received prior to the adverse action taken by your institution in respect of the above-referenced account.`,
        MARGIN, y, CONTENT_WIDTH, boldFont, regularFont);
    y -= 14;

    y = drawSectionHeading(page, 'Account in Question', y, boldFont);
    const rows: [string, string][] = [
        ['Credit Provider:', input.creditorName],
        ['Account Number:', input.accountNumber],
        ['Consumer:', input.clientFullName],
        ['ID Number:', input.clientIdNumber],
        ['Date of Adverse Action:', formatDate(input.adverseDate)],
    ];
    for (const [label, value] of rows) {
        page.drawText(label, { x: MARGIN + 8, y, size: 9, font: boldFont, color: MID });
        page.drawText(value, { x: MARGIN + 190, y, size: 9, font: regularFont, color: DARK });
        y -= 14;
    }
    y -= 6;

    y = drawSectionHeading(page, 'Demands', y, boldFont);
    const demands = [
        'Provide proof of delivery of Section 129 notice (registered mail, email, or SMS confirmation) within 10 business days.',
        'Immediately suspend all collection action on this account pending Section 129 compliance.',
        'Instruct the relevant credit bureau(s) to place the adverse listing under dispute pending resolution.',
        'If Section 129 notice cannot be evidenced, remove the adverse listing immediately and confirm in writing.',
    ];
    for (const d of demands) {
        y = drawTextBlock(page, `• ${d}`, MARGIN + 12, y, CONTENT_WIDTH - 12, boldFont, regularFont, { size: 9 });
        y -= 5;
    }
    y -= 10;

    y = drawTextBlock(page,
        `Non-compliance with Section 129 constitutes a breach of the NCA. Should you fail to respond within 10 business days, our client reserves the right to approach the National Consumer Tribunal (NCT), the NCR, and the applicable Credit Ombud for relief.`,
        MARGIN, y, CONTENT_WIDTH, boldFont, regularFont, { size: 9 });
    y -= 16;

    y = drawSignatureBlock(page,
        input.consultantName || 'Authorised Consultant',
        input.consultantTitle || 'Credit Repair Consultant',
        y, regularFont, boldFont);

    drawFooter(page, regularFont, 1, 1);
    return pdfDoc.save();
}

// ---------------------------------------------------------------------------
// LETTER D — Settlement Negotiation Letter
// ---------------------------------------------------------------------------

async function generateSettlementLetter(input: DisputeLetterInput): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const ref = input.referenceNumber || newRef();

    const outstandingBalance = input.outstandingBalance || 0;
    const offerPercent = input.settlementOfferPercent || 40;
    const settlementAmount = input.settlementAmount || Math.round(outstandingBalance * offerPercent / 100);

    let y = drawLetterhead(page, boldFont, regularFont);
    y -= 10;

    y = drawAddressBlock(
        page,
        [input.creditorName, 'Settlements / Collections Department', 'South Africa'],
        todayFormatted(), ref, y, regularFont, boldFont
    );

    page.drawText(`RE: FULL & FINAL SETTLEMENT OFFER — ${input.clientFullName} — ACCT: ${input.accountNumber}`, {
        x: MARGIN, y, size: 10, font: boldFont, color: DARK,
    });
    y -= 8;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: TEAL });
    y -= 18;

    y = drawTextBlock(page,
        `We represent ${input.clientFullName} (ID: ${input.clientIdNumber}) and write to propose a full and final settlement of the above-referenced debt. Our client acknowledges the outstanding balance and wishes to resolve this matter amicably.`,
        MARGIN, y, CONTENT_WIDTH, boldFont, regularFont);
    y -= 14;

    y = drawSectionHeading(page, 'Settlement Offer', y, boldFont);
    const rows: [string, string][] = [
        ['Account Number:', input.accountNumber],
        ['Total Outstanding Balance:', zarFormat(outstandingBalance)],
        ['Settlement Offer Amount:', zarFormat(settlementAmount)],
        ['Offer Represents:', `${offerPercent}% of outstanding balance`],
        ['Offer Valid Until:', new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' })],
    ];
    for (const [label, value] of rows) {
        page.drawText(label, { x: MARGIN + 8, y, size: 9, font: boldFont, color: MID });
        page.drawText(value, { x: MARGIN + 210, y, size: 9.5, font: label.includes('Amount') || label.includes('Outstanding') ? boldFont : regularFont, color: DARK });
        y -= 14;
    }
    y -= 6;

    y = drawSectionHeading(page, 'Conditions of Acceptance', y, boldFont);
    const conditions = [
        `Full and final settlement of ${zarFormat(settlementAmount)} to be accepted by your institution as complete discharge of the outstanding debt.`,
        'Upon receipt of payment, a paid-up letter confirming zero balance must be issued within 5 business days.',
        'All adverse credit bureau listings related to this account must be removed within 7 business days of payment.',
        'No further collection action or legal proceedings may be instituted once payment is received.',
        'This offer lapses if not accepted within 10 business days of the date of this letter.',
    ];
    for (let i = 0; i < conditions.length; i++) {
        y = drawTextBlock(page, `${i + 1}. ${conditions[i]}`, MARGIN + 8, y, CONTENT_WIDTH - 8, boldFont, regularFont, { size: 9 });
        y -= 5;
    }
    y -= 10;

    y = drawTextBlock(page,
        `Acceptance of this offer must be confirmed in writing to Zenowethu Debt Management (PTY) LTD within 10 business days. Kindly acknowledge receipt of this letter and provide banking details for payment by return.`,
        MARGIN, y, CONTENT_WIDTH, boldFont, regularFont, { size: 9 });
    y -= 16;

    y = drawSignatureBlock(page,
        input.consultantName || 'Authorised Consultant',
        input.consultantTitle || 'Credit Repair Consultant',
        y, regularFont, boldFont);

    drawFooter(page, regularFont, 1, 1);
    return pdfDoc.save();
}

// ---------------------------------------------------------------------------
// LETTER E — Paid-Up Request Letter
// ---------------------------------------------------------------------------

async function generatePaidUpRequestLetter(input: DisputeLetterInput): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const ref = input.referenceNumber || newRef();

    let y = drawLetterhead(page, boldFont, regularFont);
    y -= 10;

    y = drawAddressBlock(
        page,
        [input.creditorName, 'Client Services / Administration', 'South Africa'],
        todayFormatted(), ref, y, regularFont, boldFont
    );

    page.drawText(`RE: REQUEST FOR PAID-UP LETTER — ${input.clientFullName} — ACCT: ${input.accountNumber}`, {
        x: MARGIN, y, size: 10, font: boldFont, color: DARK,
    });
    y -= 8;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: TEAL });
    y -= 18;

    y = drawTextBlock(page,
        `We act on behalf of ${input.clientFullName} (ID: ${input.clientIdNumber}). Our client advises that the above-referenced account has been paid in full. We hereby formally request a paid-up letter confirming the zero balance status of this account for the purpose of updating the relevant credit bureau records.`,
        MARGIN, y, CONTENT_WIDTH, boldFont, regularFont);
    y -= 14;

    y = drawSectionHeading(page, 'Account Details', y, boldFont);
    const rows: [string, string][] = [
        ['Account Holder:', input.clientFullName],
        ['ID Number:', input.clientIdNumber],
        ['Account Number:', input.accountNumber],
    ];
    for (const [label, value] of rows) {
        page.drawText(label, { x: MARGIN + 8, y, size: 9, font: boldFont, color: MID });
        page.drawText(value, { x: MARGIN + 180, y, size: 9, font: regularFont, color: DARK });
        y -= 14;
    }
    y -= 6;

    y = drawSectionHeading(page, 'Request', y, boldFont);
    const requests = [
        'Issue a paid-up / zero-balance letter on your official letterhead within 5 business days.',
        'The letter must confirm the account balance as R0.00 and that no further amounts are owing.',
        'The letter must be addressed to the relevant credit bureau (Experian / TransUnion / XDS / Compuscan) for the purpose of updating the consumer credit record.',
        'Forward a copy of the paid-up letter to our office at the contact details below.',
    ];
    for (const r of requests) {
        y = drawTextBlock(page, `• ${r}`, MARGIN + 12, y, CONTENT_WIDTH - 12, boldFont, regularFont, { size: 9 });
        y -= 5;
    }
    y -= 10;

    y = drawTextBlock(page,
        `The consumer's right to have accurate credit bureau information is protected under Section 72 of the NCA. Failure to issue the paid-up letter within 5 business days may result in a formal complaint to the NCR and the applicable Credit Bureau Ombud.`,
        MARGIN, y, CONTENT_WIDTH, boldFont, regularFont, { size: 9 });
    y -= 16;

    y = drawSignatureBlock(page,
        input.consultantName || 'Authorised Consultant',
        input.consultantTitle || 'Credit Repair Consultant',
        y, regularFont, boldFont);
    y -= 10;

    drawAttachmentList(page, [
        'Certified copy of Identity Document',
        'Proof of payment / settlement confirmation',
        'Signed Power of Attorney',
    ], y, regularFont, boldFont);

    drawFooter(page, regularFont, 1, 1);
    return pdfDoc.save();
}

// ---------------------------------------------------------------------------
// LETTER F — Prescribed Debt Notice
// ---------------------------------------------------------------------------

async function generatePrescribedDebtNotice(input: DisputeLetterInput): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const ref = input.referenceNumber || newRef();

    let y = drawLetterhead(page, boldFont, regularFont);
    y -= 10;

    y = drawAddressBlock(
        page,
        [input.creditorName, 'Collections / Legal Department', 'South Africa'],
        todayFormatted(), ref, y, regularFont, boldFont
    );

    page.drawText(`RE: NOTICE OF PRESCRIPTION — PRESCRIPTION ACT 68 OF 1969 — ACCT: ${input.accountNumber}`, {
        x: MARGIN, y, size: 10, font: boldFont, color: RED,
    });
    y -= 8;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: RED });
    y -= 18;

    y = drawTextBlock(page,
        `We act on behalf of ${input.clientFullName} (ID: ${input.clientIdNumber}) and write to place you on formal notice that the debt referenced herein has PRESCRIBED in terms of the Prescription Act 68 of 1969 and the National Credit Act 34 of 2005.`,
        MARGIN, y, CONTENT_WIDTH, boldFont, regularFont);
    y -= 14;

    y = drawSectionHeading(page, 'Prescription Details', y, boldFont);
    const rows: [string, string][] = [
        ['Creditor:', input.creditorName],
        ['Account Number:', input.accountNumber],
        ['Consumer:', input.clientFullName],
        ['ID Number:', input.clientIdNumber],
        ['Last Payment / Acknowledgment:', formatDate(input.lastPaymentDate)],
        ['Adverse Listing Date:', formatDate(input.adverseDate)],
        ['Prescription Period (SA Law):', '3 years — Prescription Act 68 of 1969'],
    ];
    for (const [label, value] of rows) {
        page.drawText(label, { x: MARGIN + 8, y, size: 9, font: boldFont, color: MID });
        page.drawText(value, { x: MARGIN + 220, y, size: 9, font: regularFont, color: DARK });
        y -= 14;
    }
    y -= 6;

    y = drawSectionHeading(page, 'Legal Basis', y, boldFont);
    y = drawTextBlock(page,
        `In terms of Section 11(d) of the Prescription Act 68 of 1969, a debt prescribes after three (3) years from the date on which it becomes due, in the absence of any written acknowledgment of debt or payment. Our client has made no payment on and issued no acknowledgment in respect of this debt within the relevant 3-year period. The debt has accordingly prescribed and is no longer legally enforceable.`,
        MARGIN + 8, y, CONTENT_WIDTH - 8, boldFont, regularFont);
    y -= 14;

    y = drawSectionHeading(page, 'Demands', y, boldFont);
    const demands = [
        'Immediately cease all collection action, telephone calls, SMS contact, and legal threats in relation to this debt.',
        'Instruct all credit bureaus to remove the adverse listing related to this prescribed debt within 7 business days.',
        'Issue written confirmation that this debt is acknowledged as prescribed and that no further action will be taken.',
        'Failure to comply constitutes harassment under the Consumer Protection Act and will be reported to the NCR.',
    ];
    for (const d of demands) {
        y = drawTextBlock(page, `• ${d}`, MARGIN + 12, y, CONTENT_WIDTH - 12, boldFont, regularFont, { size: 9 });
        y -= 5;
    }
    y -= 10;

    y = drawTextBlock(page,
        `Any attempt to collect a prescribed debt is a contravention of the NCA and the Prescription Act. Our client expressly does NOT acknowledge this debt in any way by the sending of this notice.`,
        MARGIN, y, CONTENT_WIDTH, boldFont, regularFont, { size: 9, color: RED });
    y -= 16;

    y = drawSignatureBlock(page,
        input.consultantName || 'Authorised Consultant',
        input.consultantTitle || 'Credit Repair Consultant',
        y, regularFont, boldFont);

    drawFooter(page, regularFont, 1, 1);
    return pdfDoc.save();
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Generate a dispute letter as a PDF Uint8Array.
 * Returns the PDF bytes ready to be saved to disk or served as a download.
 */
export async function generateDisputeLetter(
    type: DisputeLetterType,
    input: DisputeLetterInput
): Promise<Uint8Array> {
    logger.info({ type, creditor: input.creditorName }, '📄 Generating dispute letter');

    if (!input.referenceNumber) {
        input = { ...input, referenceNumber: newRef() };
    }

    switch (type) {
        case 'CREDIT_BUREAU_DISPUTE':
            return generateCreditBureauDisputeLetter(input);
        case 'CREDIT_PROVIDER_DISPUTE':
            return generateCreditProviderDisputeLetter(input);
        case 'SECTION_129_DEMAND':
            return generateSection129Demand(input);
        case 'SETTLEMENT_NEGOTIATION':
            return generateSettlementLetter(input);
        case 'PAID_UP_REQUEST':
            return generatePaidUpRequestLetter(input);
        case 'PRESCRIBED_DEBT_NOTICE':
            return generatePrescribedDebtNotice(input);
        default:
            throw new Error(`Unknown dispute letter type: ${type}`);
    }
}

/**
 * Generate ALL applicable dispute letters for a set of classified adverse listings.
 * Returns a map of { referenceNumber → PDF bytes }.
 */
export async function generateAllDisputeLetters(
    classifiedListings: Array<{
        creditor: string;
        accountNumber: string;
        adverseCode: string;
        adverseDate: string;
        lastPaymentDate: string;
        openBalance: number;
        overdueBalance: number;
        classification: 'DISPUTABLE' | 'NEGOTIABLE' | 'VALID';
        grounds: string[];
        isPrescribed: boolean;
    }>,
    clientInfo: {
        fullName: string;
        idNumber: string;
        address?: string;
        cellNumber?: string;
    },
    bureauName: string,
    consultantName?: string
): Promise<Array<{ referenceNumber: string; type: DisputeLetterType; creditor: string; pdfBytes: Uint8Array }>> {
    const results: Array<{ referenceNumber: string; type: DisputeLetterType; creditor: string; pdfBytes: Uint8Array }> = [];

    for (const listing of classifiedListings) {
        if (listing.classification === 'VALID') continue;

        const base: DisputeLetterInput = {
            clientFullName: clientInfo.fullName,
            clientIdNumber: clientInfo.idNumber,
            clientAddress: clientInfo.address,
            clientCellNumber: clientInfo.cellNumber,
            creditorName: listing.creditor,
            accountNumber: listing.accountNumber,
            adverseCode: listing.adverseCode,
            adverseDate: listing.adverseDate,
            lastPaymentDate: listing.lastPaymentDate,
            outstandingBalance: listing.openBalance,
            overdueBalance: listing.overdueBalance,
            bureauName,
            disputeGrounds: listing.grounds,
            consultantName: consultantName || 'Authorised Consultant',
            consultantTitle: 'Credit Repair Consultant',
            referenceNumber: newRef(),
        };

        // Always generate a credit bureau dispute letter for DISPUTABLE
        if (listing.classification === 'DISPUTABLE') {
            const pdfBytes = await generateDisputeLetter('CREDIT_BUREAU_DISPUTE', base);
            results.push({ referenceNumber: base.referenceNumber!, type: 'CREDIT_BUREAU_DISPUTE', creditor: listing.creditor, pdfBytes });

            // Also generate credit provider dispute letter
            const pdfBytes2 = await generateDisputeLetter('CREDIT_PROVIDER_DISPUTE', { ...base, referenceNumber: newRef() });
            results.push({ referenceNumber: newRef(), type: 'CREDIT_PROVIDER_DISPUTE', creditor: listing.creditor, pdfBytes: pdfBytes2 });

            // Prescribed debt gets its own notice
            if (listing.isPrescribed) {
                const pdfBytes3 = await generateDisputeLetter('PRESCRIBED_DEBT_NOTICE', { ...base, referenceNumber: newRef() });
                results.push({ referenceNumber: newRef(), type: 'PRESCRIBED_DEBT_NOTICE', creditor: listing.creditor, pdfBytes: pdfBytes3 });
            }
        }

        // For NEGOTIABLE accounts, generate a settlement offer
        if (listing.classification === 'NEGOTIABLE' && listing.openBalance > 0) {
            const pdfBytes = await generateDisputeLetter('SETTLEMENT_NEGOTIATION', {
                ...base,
                referenceNumber: newRef(),
                settlementOfferPercent: 40,
            });
            results.push({ referenceNumber: newRef(), type: 'SETTLEMENT_NEGOTIATION', creditor: listing.creditor, pdfBytes });
        }
    }

    return results;
}
