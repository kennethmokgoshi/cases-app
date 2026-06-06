import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage, PDFEmbeddedPage } from 'pdf-lib'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

export interface InvoiceLineItem {
  description?: string
  creditor?: string
  serviceKey?: string
  serviceLabel?: string
  quantity: number
  unitPrice: number
}

export interface InvoiceData {
  documentType?: 'INVOICE' | 'QUOTE'
  invoiceNumber: string
  issuedAt: Date
  dueAt: Date
  status: string
  clientName?: string
  clientEmail?: string
  clientPhone?: string
  clientIdNumber?: string
  clientAccountNumber?: string
  clientCurrentBalance?: number
  caseFileNumber?: string
  lineItems: InvoiceLineItem[]
  subtotal: number
  vatRate: number
  vatAmount: number
  total: number
  notes?: string
  reference?: string
  createdByName?: string
  bankName?: string
  bankAccountName?: string
  bankAccountNumber?: string
  branchCode?: string
}

function lineItemDescription(item: InvoiceLineItem): string {
  if (item.creditor && item.serviceLabel) return `${item.creditor} — ${item.serviceLabel}`
  if (item.creditor) return item.creditor
  return item.description ?? ''
}

// ── Zenowethu brand colours (fallback when no letterhead available) ───────────
const NAVY      = rgb(0.043, 0.114, 0.208)   // #0B1D35
const ORANGE    = rgb(0.769, 0.584, 0.227)   // #C4953A
const DARK_TEXT = rgb(0.15,  0.15,  0.15)
const GRAY_TEXT = rgb(0.45,  0.45,  0.45)
const WHITE     = rgb(1, 1, 1)
const LIGHT_ROW = rgb(0.96,  0.96,  0.96)

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatZAR(amount: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency', currency: 'ZAR', minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(date)
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

function drawText(
  page: PDFPage, text: string, x: number, y: number,
  font: PDFFont, size: number, color: ReturnType<typeof rgb> = DARK_TEXT,
): void { page.drawText(text, { x, y, font, size, color }) }

function drawRightAlignedText(
  page: PDFPage, text: string, rightEdge: number, y: number,
  font: PDFFont, size: number, color: ReturnType<typeof rgb> = DARK_TEXT,
): void {
  const w = font.widthOfTextAtSize(text, size)
  page.drawText(text, { x: rightEdge - w, y, font, size, color })
}

// ── Letterhead loader (same candidates as POA generator) ──────────────────────
async function tryLoadLetterhead(): Promise<Uint8Array | null> {
  const candidates = [
    join(process.cwd(), 'public', 'templates', 'poa', 'Letterhead.pdf'),
    join(process.cwd(), 'apps', 'cases', 'public', 'templates', 'poa', 'Letterhead.pdf'),
    '/app/apps/cases/public/templates/poa/Letterhead.pdf',
    '/app/public/templates/poa/Letterhead.pdf',
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      try { return await readFile(p) } catch { /* try next */ }
    }
  }
  return null
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()

  const W      = 595.28
  const H      = 841.89
  const MARGIN = 52
  const RIGHT  = W - MARGIN
  const CONTENT_W = RIGHT - MARGIN

  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)

  // ── Try to embed the real letterhead as page background ───────────────────
  const lhBytes = await tryLoadLetterhead()
  let letterhead: PDFEmbeddedPage | null = null
  if (lhBytes) {
    try {
      const [embedded] = await pdfDoc.embedPdf(lhBytes, [0])
      letterhead = embedded
    } catch { /* fall back to programmatic header */ }
  }

  const page = pdfDoc.addPage([W, H])

  // ── Background: real letterhead OR programmatic navy header ───────────────
  let contentTop: number   // y where invoice content starts (below letterhead header)
  let contentBottom: number // y where content must stop (above letterhead footer)

  if (letterhead) {
    // Draw the letterhead as full-page background
    page.drawPage(letterhead, { x: 0, y: 0, width: W, height: H })
    // Safe content area based on the Zenowethu letterhead layout
    contentTop    = 655   // just below the pre-printed header band
    contentBottom = 148   // just above the pre-printed footer strip
  } else {
    // ── Fallback: programmatic Zenowethu-branded header ──────────────────────
    const HEADER_H = 100
    page.drawRectangle({ x: 0, y: H - HEADER_H, width: W, height: HEADER_H, color: NAVY })
    page.drawRectangle({ x: W - 6, y: H - HEADER_H, width: 6, height: HEADER_H, color: ORANGE })

    drawText(page, 'ZENOWETHU', MARGIN, H - 32, bold, 22, WHITE)
    drawText(page, 'DEBT MANAGEMENT (PTY) LTD', MARGIN, H - 50, regular, 9, rgb(0.75, 0.75, 0.75))
    drawText(page, 'NCR Reg: NCRDC3693  |  DCASA Member', MARGIN, H - 64, regular, 7.5, rgb(0.65, 0.65, 0.65))
    drawText(page, 'Suite 2, 2nd Floor, Central House, 17 Central Road, Mabopane, 0190', MARGIN, H - 76, regular, 7, rgb(0.60, 0.60, 0.60))
    drawText(page, 'Tel: +27 12 035 1824  |  info@zenowethu.co.za  |  www.zenowethu.co.za', MARGIN, H - 88, regular, 7, rgb(0.60, 0.60, 0.60))

    // Footer
    const FY = 38
    page.drawLine({ start: { x: MARGIN, y: FY + 26 }, end: { x: RIGHT, y: FY + 26 }, thickness: 0.5, color: ORANGE })
    drawText(page, 'Aaron Nzotho | NCRDC3693 | Suite 2, 2nd Floor, Central House, 17 Central Road, Mabopane, 0190', MARGIN, FY + 14, regular, 6.5, GRAY_TEXT)
    drawText(page, 'Tel: +27 12 035 1824  |  Cell: 082 363 8207  |  info@zenowethu.co.za  |  www.zenowethu.co.za  |  Member of DCASA', MARGIN, FY + 2, regular, 6.5, GRAY_TEXT)
    drawRightAlignedText(page, 'Page 1 of 1', RIGHT, FY + 2, regular, 7, GRAY_TEXT)

    contentTop    = H - HEADER_H - 16
    contentBottom = FY + 36
  }

  // ── From here: draw all invoice content within contentBottom … contentTop ──
  let cursor = contentTop

  // ── 1. DOCUMENT TITLE BLOCK ───────────────────────────────────────────────
  const docLabel = data.documentType === 'QUOTE' ? 'QUOTATION' : 'INVOICE'
  drawRightAlignedText(page, docLabel, RIGHT, cursor - 2, bold, 20, ORANGE)
  drawRightAlignedText(page, data.invoiceNumber, RIGHT, cursor - 20, regular, 9, DARK_TEXT)
  drawRightAlignedText(page, `Status: ${data.status}`, RIGHT, cursor - 34, regular, 8, GRAY_TEXT)
  if (data.createdByName) {
    drawRightAlignedText(page, `Prepared by: ${data.createdByName}`, RIGHT, cursor - 48, regular, 7.5, GRAY_TEXT)
  }

  // ── 2. META BLOCK: BILL TO (left) | Dates (right) ────────────────────────
  const metaTop = cursor

  drawText(page, 'BILL TO', MARGIN, metaTop - 12, bold, 7.5, GRAY_TEXT)
  let leftY = metaTop - 26

  if (data.clientName) {
    drawText(page, data.clientName, MARGIN, leftY, bold, 11, DARK_TEXT)
    leftY -= 15
  }
  if (data.clientIdNumber) {
    drawText(page, `ID Number: ${data.clientIdNumber}`, MARGIN, leftY, regular, 8.5, GRAY_TEXT)
    leftY -= 12
  }
  if (data.clientEmail) {
    drawText(page, data.clientEmail, MARGIN, leftY, regular, 8.5, GRAY_TEXT)
    leftY -= 12
  }
  if (data.clientPhone) {
    drawText(page, `Tel: ${data.clientPhone}`, MARGIN, leftY, regular, 8.5, GRAY_TEXT)
    leftY -= 12
  }
  if (data.caseFileNumber) {
    drawText(page, `Case: ${data.caseFileNumber}`, MARGIN, leftY, regular, 8.5, GRAY_TEXT)
    leftY -= 12
  }
  if (data.clientAccountNumber) {
    drawText(page, `Account No: ${data.clientAccountNumber}`, MARGIN, leftY, regular, 8.5, GRAY_TEXT)
    leftY -= 12
  }
  if (data.clientCurrentBalance !== undefined) {
    drawText(page, `Current Balance: ${formatZAR(data.clientCurrentBalance)}`, MARGIN, leftY, bold, 8.5, NAVY)
    leftY -= 12
  }
  if (data.reference) {
    drawText(page, `Ref: ${data.reference}`, MARGIN, leftY, regular, 8.5, GRAY_TEXT)
  }

  // Right: dates
  const rightColX = W / 2 + 20
  const detailsLabel = data.documentType === 'QUOTE' ? 'QUOTATION DETAILS' : 'INVOICE DETAILS'
  drawText(page, detailsLabel, rightColX, metaTop - 12, bold, 7.5, GRAY_TEXT)

  const dueDateLabel = data.documentType === 'QUOTE' ? 'Valid Until' : 'Due Date'
  let rightY = metaTop - 26
  for (const [label, value] of [
    ['Issue Date', formatDate(data.issuedAt)],
    [dueDateLabel, formatDate(data.dueAt)],
  ]) {
    drawText(page, label, rightColX, rightY, regular, 9, GRAY_TEXT)
    drawRightAlignedText(page, value, RIGHT, rightY, regular, 9, DARK_TEXT)
    rightY -= 14
  }

  cursor = Math.min(leftY, rightY) - 12

  // Divider
  page.drawLine({ start: { x: MARGIN, y: cursor + 6 }, end: { x: RIGHT, y: cursor + 6 }, thickness: 0.4, color: rgb(0.82, 0.82, 0.82) })
  cursor -= 12

  // ── 3. LINE ITEMS TABLE ───────────────────────────────────────────────────
  const ROW_H  = 19
  const COL_QTY   = 60
  const COL_PRICE = 95
  const COL_AMT   = 95
  const COL_DESC  = CONTENT_W - COL_QTY - COL_PRICE - COL_AMT

  // Table header
  page.drawRectangle({ x: MARGIN, y: cursor - ROW_H, width: CONTENT_W, height: ROW_H, color: NAVY })
  const hY = cursor - ROW_H + 6
  drawText(page, 'DESCRIPTION', MARGIN + 5, hY, bold, 7.5, WHITE)
  drawRightAlignedText(page, 'QTY',        MARGIN + COL_DESC - 4,                      hY, bold, 7.5, WHITE)
  drawRightAlignedText(page, 'UNIT PRICE', MARGIN + COL_DESC + COL_QTY + COL_PRICE - 4, hY, bold, 7.5, WHITE)
  drawRightAlignedText(page, 'AMOUNT',     RIGHT - 4,                                   hY, bold, 7.5, WHITE)
  cursor -= ROW_H

  const displayItems = data.lineItems.slice(0, 20)
  for (let i = 0; i < displayItems.length; i++) {
    const item  = displayItems[i]
    const rowY  = cursor - ROW_H
    if (i % 2 === 1) {
      page.drawRectangle({ x: MARGIN, y: rowY, width: CONTENT_W, height: ROW_H, color: LIGHT_ROW })
    }
    const textY = rowY + 6
    const amt   = item.quantity * item.unitPrice
    drawText(page, truncate(lineItemDescription(item), 58), MARGIN + 5, textY, regular, 8.5, DARK_TEXT)
    drawRightAlignedText(page, String(item.quantity),  MARGIN + COL_DESC - 4,                      textY, regular, 8.5, DARK_TEXT)
    drawRightAlignedText(page, formatZAR(item.unitPrice), MARGIN + COL_DESC + COL_QTY + COL_PRICE - 4, textY, regular, 8.5, DARK_TEXT)
    drawRightAlignedText(page, formatZAR(amt),         RIGHT - 4,                                   textY, regular, 8.5, DARK_TEXT)
    cursor -= ROW_H
  }

  if (data.lineItems.length > 20) {
    cursor -= 4
    drawText(page, `+ ${data.lineItems.length - 20} more items (see attached sheet)`, MARGIN + 5, cursor, regular, 7.5, GRAY_TEXT)
    cursor -= 10
  }

  page.drawLine({ start: { x: MARGIN, y: cursor }, end: { x: RIGHT, y: cursor }, thickness: 0.4, color: rgb(0.80, 0.80, 0.80) })
  cursor -= 16

  // ── 4. TOTALS ─────────────────────────────────────────────────────────────
  const TX = W - MARGIN - 210
  for (const [label, value] of [
    ['Subtotal', formatZAR(data.subtotal)],
    [`VAT (${Math.round(data.vatRate * 100)}%)`, formatZAR(data.vatAmount)],
  ] as [string, string][]) {
    drawText(page, label, TX, cursor, regular, 8.5, GRAY_TEXT)
    drawRightAlignedText(page, value, RIGHT, cursor, regular, 8.5, DARK_TEXT)
    cursor -= 14
  }
  page.drawLine({ start: { x: TX, y: cursor + 4 }, end: { x: RIGHT, y: cursor + 4 }, thickness: 0.4, color: rgb(0.75, 0.75, 0.75) })
  cursor -= 10
  drawText(page, 'TOTAL DUE', TX, cursor, bold, 11, DARK_TEXT)
  drawRightAlignedText(page, formatZAR(data.total), RIGHT, cursor, bold, 13, ORANGE)
  cursor -= 32

  // ── 5. PAYMENT INSTRUCTIONS ───────────────────────────────────────────────
  const bankName    = data.bankName          || process.env.COMPANY_BANK_NAME    || 'CAPITEC BUSINESS'
  const bankAccount = data.bankAccountNumber || process.env.COMPANY_BANK_ACCOUNT || '105 181 8346'
  const branchCode  = data.branchCode        || process.env.COMPANY_BRANCH_CODE  || '450105'
  const accountName = data.bankAccountName   || 'Zenowethu Debt Management (Pty) Ltd'

  const bankRows: [string, string][] = [
    ['Bank',           bankName],
    ['Account Name',   accountName],
    ['Account Number', bankAccount],
    ...(branchCode ? [['Branch Code', branchCode] as [string, string]] : []),
    ['VAT Number',     process.env.COMPANY_VAT_NUMBER || '4590307072'],
    ['Reference',      data.invoiceNumber],
  ]
  const bankBlockH = 14 + bankRows.length * 12

  // Guard: don't draw outside safe area
  if (cursor - bankBlockH >= contentBottom) {
    page.drawRectangle({
      x: MARGIN, y: cursor - bankBlockH,
      width: CONTENT_W, height: bankBlockH,
      color: rgb(0.97, 0.97, 0.97),
      borderColor: rgb(0.88, 0.88, 0.88),
      borderWidth: 0.5,
    })
    drawText(page, 'PAYMENT INSTRUCTIONS', MARGIN + 8, cursor - 10, bold, 7.5, GRAY_TEXT)
    let bY = cursor - 22
    for (const [label, value] of bankRows) {
      drawText(page, `${label}:`, MARGIN + 8, bY, bold, 7.5, GRAY_TEXT)
      drawText(page, value, MARGIN + 95, bY, regular, 7.5, DARK_TEXT)
      bY -= 12
    }
    cursor -= bankBlockH + 8
  }

  // ── 6. NOTES ──────────────────────────────────────────────────────────────
  if (data.notes && cursor - 30 >= contentBottom) {
    cursor -= 10
    drawText(page, 'NOTES', MARGIN, cursor, bold, 7.5, GRAY_TEXT)
    cursor -= 12
    const words = data.notes.split(' ')
    let line = ''
    for (const word of words) {
      if ((line + ' ' + word).trim().length > 95) {
        if (cursor < contentBottom) break
        drawText(page, line.trim(), MARGIN, cursor, regular, 7.5, GRAY_TEXT)
        cursor -= 11
        line = word
      } else {
        line = line + ' ' + word
      }
    }
    if (line.trim() && cursor >= contentBottom) {
      drawText(page, line.trim(), MARGIN, cursor, regular, 7.5, GRAY_TEXT)
    }
  }

  return pdfDoc.save()
}
