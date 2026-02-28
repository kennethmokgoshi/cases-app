import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';
import type { AccountFinding } from './forensic-engine';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type AuditReportData = {
    fileNumber: string
    clientName: string
    idNumber: string
    auditDate: Date
    auditorName: string
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    totalRiskScore: number
    totalAccounts: number
    summaryFindings: Array<{ type: string; severity: string; message: string }>
    accountFindings: AccountFinding[]
    recommendedAction: string
    section80Eligible: boolean
}

// ─────────────────────────────────────────────
// Colours (match the platform design system)
// ─────────────────────────────────────────────

const EMERALD   = rgb(0.039, 0.722, 0.510)   // #0AB882
const DARK_BG   = rgb(0.118, 0.118, 0.118)   // #1E1E1E
const DARK_TEXT = rgb(0.15, 0.15, 0.15)
const GRAY_TEXT = rgb(0.45, 0.45, 0.45)
const WHITE     = rgb(1, 1, 1)
const LIGHT_ROW = rgb(0.96, 0.96, 0.96)
const RED       = rgb(0.85, 0.15, 0.15)
const ORANGE    = rgb(0.92, 0.45, 0.10)
const YELLOW    = rgb(0.85, 0.75, 0.10)

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-ZA', {
        day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function formatZAR(amount: number): string {
    return new Intl.NumberFormat('en-ZA', {
        style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(amount);
}

function truncate(str: string, max: number): string {
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function drawText(
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    font: PDFFont,
    size: number,
    color: ReturnType<typeof rgb> = DARK_TEXT,
): void {
    page.drawText(text, { x, y, font, size, color });
}

function drawRightAlignedText(
    page: PDFPage,
    text: string,
    rightEdge: number,
    y: number,
    font: PDFFont,
    size: number,
    color: ReturnType<typeof rgb> = DARK_TEXT,
): void {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: rightEdge - w, y, font, size, color });
}

function riskColor(level: AuditReportData['riskLevel']): ReturnType<typeof rgb> {
    if (level === 'CRITICAL') return RED;
    if (level === 'HIGH')     return ORANGE;
    if (level === 'MEDIUM')   return YELLOW;
    return EMERALD;
}

function severityColor(severity: string): ReturnType<typeof rgb> {
    if (severity === 'CRITICAL') return RED;
    if (severity === 'HIGH')     return ORANGE;
    if (severity === 'MEDIUM')   return YELLOW;
    return EMERALD;
}

// ─────────────────────────────────────────────
// Main PDF generator
// ─────────────────────────────────────────────

export async function generateAuditReportPdf(data: AuditReportData): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();

    const W = 595.28;
    const H = 841.89;
    const MARGIN = 48;
    const CONTENT_W = W - MARGIN * 2;
    const RIGHT = W - MARGIN;

    const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // ─────────────────────────────────────
    // PAGE 1
    // ─────────────────────────────────────
    let page = pdfDoc.addPage([W, H]);
    let cursor = H;

    // ── 1. HEADER BAND ──────────────────
    const HEADER_H = 90;
    cursor -= HEADER_H;

    page.drawRectangle({ x: 0, y: cursor, width: W, height: HEADER_H, color: DARK_BG });

    drawText(page, 'ZENOWETHU', MARGIN, cursor + 58, bold, 20, WHITE);
    drawText(page, 'FORENSIC AUDIT DIVISION', MARGIN, cursor + 40, regular, 9, rgb(0.7, 0.7, 0.7));
    drawText(page, 'forensic@zenowethu.co.za', MARGIN, cursor + 24, regular, 8, rgb(0.6, 0.6, 0.6));

    drawRightAlignedText(page, 'FORENSIC AUDIT REPORT', RIGHT, cursor + 58, bold, 16, EMERALD);
    drawRightAlignedText(page, `Case: ${data.fileNumber}`, RIGHT, cursor + 40, regular, 10, WHITE);
    drawRightAlignedText(page, `Date: ${formatDate(data.auditDate)}`, RIGHT, cursor + 24, regular, 8, rgb(0.7, 0.7, 0.7));

    cursor -= 28;

    // ── 2. CASE SUMMARY BLOCK ──────────
    drawText(page, 'CASE SUMMARY', MARGIN, cursor - 12, bold, 8, GRAY_TEXT);
    let leftY = cursor - 28;

    const summaryRows: [string, string][] = [
        ['Client',   data.clientName],
        ['ID Number', data.idNumber || 'Not on record'],
        ['File No.',  data.fileNumber],
        ['Auditor',   data.auditorName],
        ['Date',      formatDate(data.auditDate)],
    ];

    for (const [label, value] of summaryRows) {
        drawText(page, `${label}:`, MARGIN, leftY, bold, 9, GRAY_TEXT);
        drawText(page, value, MARGIN + 80, leftY, regular, 9, DARK_TEXT);
        leftY -= 15;
    }

    cursor = leftY - 16;

    // Divider
    page.drawLine({
        start: { x: MARGIN, y: cursor + 8 },
        end:   { x: RIGHT,  y: cursor + 8 },
        thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    cursor -= 16;

    // ── 3. RISK SCORE PANEL ─────────────
    const SCORE_H = 64;
    page.drawRectangle({
        x: MARGIN, y: cursor - SCORE_H,
        width: CONTENT_W, height: SCORE_H,
        color: LIGHT_ROW,
        borderColor: rgb(0.88, 0.88, 0.88),
        borderWidth: 0.5 });

    // Score number (large)
    const scoreStr = `${data.totalRiskScore}`;
    drawText(page, scoreStr, MARGIN + 14, cursor - SCORE_H + 20, bold, 28, riskColor(data.riskLevel));

    // /100
    const scoreWidth = bold.widthOfTextAtSize(scoreStr, 28);
    drawText(page, '/100', MARGIN + 14 + scoreWidth + 2, cursor - SCORE_H + 22, regular, 11, GRAY_TEXT);

    // Risk label badge
    const labelX = MARGIN + 14 + scoreWidth + 42;
    drawText(page, data.riskLevel, labelX, cursor - SCORE_H + 22, bold, 13, riskColor(data.riskLevel));

    // Accounts scanned
    drawRightAlignedText(
        page,
        `${data.totalAccounts} account${data.totalAccounts !== 1 ? 's' : ''} analysed`,
        RIGHT - 14, cursor - SCORE_H + 40, regular, 9, GRAY_TEXT
    );

    const flagCount = data.summaryFindings.length;
    drawRightAlignedText(
        page,
        `${flagCount} finding${flagCount !== 1 ? 's' : ''} flagged`,
        RIGHT - 14, cursor - SCORE_H + 24, regular, 9, GRAY_TEXT
    );

    cursor -= SCORE_H + 20;

    // ── 4. FINDINGS SUMMARY ─────────────
    if (data.summaryFindings.length > 0) {
        drawText(page, `FINDINGS (${data.summaryFindings.length})`, MARGIN, cursor, bold, 8, GRAY_TEXT);
        cursor -= 18;

        for (const finding of data.summaryFindings.slice(0, 12)) {
            // Severity dot
            page.drawCircle({
                x: MARGIN + 5, y: cursor + 3,
                size: 3.5,
                color: severityColor(finding.severity) });

            // Severity label
            drawText(page, finding.severity, MARGIN + 14, cursor, bold, 8, severityColor(finding.severity));
            const sevWidth = bold.widthOfTextAtSize(finding.severity, 8);

            // Message
            drawText(
                page,
                truncate(finding.message, 90),
                MARGIN + 14 + sevWidth + 6,
                cursor,
                regular, 8, DARK_TEXT
            );
            cursor -= 14;
        }

        if (data.summaryFindings.length > 12) {
            drawText(page, `+ ${data.summaryFindings.length - 12} more findings (see per-account table)`, MARGIN + 14, cursor, regular, 8, GRAY_TEXT);
            cursor -= 14;
        }

        cursor -= 12;
    } else {
        page.drawRectangle({
            x: MARGIN, y: cursor - 32,
            width: CONTENT_W, height: 32,
            color: rgb(0.94, 0.99, 0.96),
            borderColor: EMERALD, borderWidth: 0.5 });
        drawText(page, 'No forensic issues flagged across all accounts.', MARGIN + 10, cursor - 20, regular, 9, EMERALD);
        cursor -= 44;
    }

    // Divider
    page.drawLine({
        start: { x: MARGIN, y: cursor + 4 },
        end:   { x: RIGHT,  y: cursor + 4 },
        thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    cursor -= 18;

    // ── 5. PER-ACCOUNT TABLE ────────────
    drawText(page, 'PER-ACCOUNT BREAKDOWN', MARGIN, cursor, bold, 8, GRAY_TEXT);
    cursor -= 16;

    const ROW_H = 20;
    const COL_CREDITOR = 130;
    const COL_TYPE     = 80;
    const COL_BALANCE  = 75;
    const COL_FLAG     = 40;
    const COL_SCORE    = 40;
    // headers
    page.drawRectangle({
        x: MARGIN, y: cursor - ROW_H,
        width: CONTENT_W, height: ROW_H,
        color: EMERALD });
    const hY = cursor - ROW_H + 6;
    let hX = MARGIN + 4;
    drawText(page, 'CREDITOR',    hX, hY, bold, 7, WHITE); hX += COL_CREDITOR;
    drawText(page, 'TYPE',        hX, hY, bold, 7, WHITE); hX += COL_TYPE;
    drawText(page, 'BALANCE',     hX, hY, bold, 7, WHITE); hX += COL_BALANCE;
    drawText(page, 'PRESC',       hX, hY, bold, 7, WHITE); hX += COL_FLAG;
    drawText(page, 'RECKLS',      hX, hY, bold, 7, WHITE); hX += COL_FLAG;
    drawText(page, 'RATE',        hX, hY, bold, 7, WHITE); hX += COL_FLAG;
    drawText(page, 'INS',         hX, hY, bold, 7, WHITE); hX += COL_FLAG;
    drawText(page, 'SCORE',       hX, hY, bold, 7, WHITE);
    cursor -= ROW_H;

    const displayAccounts = data.accountFindings.slice(0, 18);
    for (let i = 0; i < displayAccounts.length; i++) {
        const af = displayAccounts[i];
        const rowY = cursor - ROW_H;

        if (i % 2 === 1) {
            page.drawRectangle({
                x: MARGIN, y: rowY,
                width: CONTENT_W, height: ROW_H,
                color: LIGHT_ROW });
        }

        const tY = rowY + 6;
        let cX = MARGIN + 4;
        const flag = (v: boolean) => v ? '⚠' : '✓';
        const flagColor = (v: boolean) => v ? ORANGE : EMERALD;

        drawText(page, truncate(af.creditorName, 22), cX, tY, regular, 7, DARK_TEXT); cX += COL_CREDITOR;
        drawText(page, truncate(af.accountType, 13),  cX, tY, regular, 7, DARK_TEXT); cX += COL_TYPE;
        drawText(page, formatZAR(af.outstandingBalance), cX, tY, regular, 7, DARK_TEXT); cX += COL_BALANCE;
        drawText(page, flag(af.checks.prescription.flagged),     cX + 6, tY, bold, 8, flagColor(af.checks.prescription.flagged));     cX += COL_FLAG;
        drawText(page, flag(af.checks.recklessLending.flagged),  cX + 6, tY, bold, 8, flagColor(af.checks.recklessLending.flagged));  cX += COL_FLAG;
        drawText(page, flag(af.checks.interestRate.flagged),     cX + 6, tY, bold, 8, flagColor(af.checks.interestRate.flagged));     cX += COL_FLAG;
        drawText(page, flag(af.checks.insurancePremium.flagged), cX + 6, tY, bold, 8, flagColor(af.checks.insurancePremium.flagged)); cX += COL_FLAG;
        drawText(page, String(af.accountRiskScore), cX + 4, tY, bold, 7,
            af.accountRiskScore >= 60 ? RED : af.accountRiskScore >= 30 ? ORANGE : EMERALD);

        cursor -= ROW_H;

        // Start a new page if we're running out of space
        if (cursor < 120 && i < displayAccounts.length - 1) {
            drawFooter(page, bold, regular, MARGIN, RIGHT, 1, 2);
            page = pdfDoc.addPage([W, H]);
            cursor = H - 48;
        }
    }

    if (data.accountFindings.length > 18) {
        cursor -= 6;
        drawText(page, `+ ${data.accountFindings.length - 18} more accounts not shown`, MARGIN + 4, cursor, regular, 7, GRAY_TEXT);
        cursor -= 14;
    }

    cursor -= 20;

    // ── 6. RECOMMENDED ACTION BOX ───────
    if (cursor < 120) {
        drawFooter(page, bold, regular, MARGIN, RIGHT, 1, 2);
        page = pdfDoc.addPage([W, H]);
        cursor = H - 48;
    }

    const REC_BOX_H = 70;
    page.drawRectangle({
        x: MARGIN, y: cursor - REC_BOX_H,
        width: CONTENT_W, height: REC_BOX_H,
        color: data.section80Eligible ? rgb(1, 0.93, 0.93) : rgb(0.94, 0.99, 0.96),
        borderColor: data.section80Eligible ? RED : EMERALD,
        borderWidth: 0.75 });

    drawText(page, 'RECOMMENDED ACTION', MARGIN + 10, cursor - 14, bold, 8, GRAY_TEXT);
    drawText(page, data.section80Eligible ? '⚠ LEGAL ACTION RECOMMENDED' : '✓ ADVISORY', RIGHT - 10, cursor - 14, bold, 8,
        data.section80Eligible ? RED : EMERALD);

    // Word-wrap recommendation text
    const words = data.recommendedAction.split(' ');
    let line = '';
    let recY = cursor - 28;
    for (const word of words) {
        if ((line + ' ' + word).trim().length > 88) {
            drawText(page, line.trim(), MARGIN + 10, recY, regular, 8, DARK_TEXT);
            recY -= 12;
            line = word;
        } else {
            line = line + ' ' + word;
        }
    }
    if (line.trim()) {
        drawText(page, line.trim(), MARGIN + 10, recY, regular, 8, DARK_TEXT);
    }

    cursor -= REC_BOX_H + 20;

    // ── 7. CONFIDENTIALITY NOTICE ───────
    drawText(page, 'CONFIDENTIALITY NOTICE', MARGIN, cursor, bold, 7, GRAY_TEXT);
    cursor -= 12;
    drawText(page, 'This report is prepared exclusively for debt review purposes under the National Credit Act (NCA) and is strictly confidential.', MARGIN, cursor, regular, 7, GRAY_TEXT);
    cursor -= 10;
    drawText(page, 'Unauthorised disclosure is prohibited. The findings constitute a preliminary forensic assessment and do not constitute legal advice.', MARGIN, cursor, regular, 7, GRAY_TEXT);

    // ── Footer ───────────────────────────
    const totalPages = pdfDoc.getPageCount();
    drawFooter(page, bold, regular, MARGIN, RIGHT, totalPages, totalPages);

    return pdfDoc.save();
}

function drawFooter(
    page: PDFPage,
    bold: PDFFont,
    regular: PDFFont,
    MARGIN: number,
    RIGHT: number,
    currentPage: number,
    totalPages: number,
): void {
    const FOOTER_Y = 28;
    page.drawLine({
        start: { x: MARGIN, y: FOOTER_Y + 12 },
        end:   { x: RIGHT,  y: FOOTER_Y + 12 },
        thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    page.drawText('Zenowethu Forensic Audit Division — Confidential', {
        x: MARGIN, y: FOOTER_Y,
        font: regular, size: 7, color: rgb(0.45, 0.45, 0.45) });
    const pageStr = `Page ${currentPage} of ${totalPages}`;
    const pageW = regular.widthOfTextAtSize(pageStr, 7);
    page.drawText(pageStr, {
        x: RIGHT - pageW, y: FOOTER_Y,
        font: regular, size: 7, color: rgb(0.45, 0.45, 0.45) });
}
