import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib'

// ---- Types ----

export interface InvoiceLineItem {
  // Legacy free-text format
  description?: string
  // Account+service format
  creditor?: string
  serviceKey?: string
  serviceLabel?: string
  quantity: number
  unitPrice: number
}

export interface BankingDetails {
  bankName: string
  accountHolder: string
  accountNumber: string
  branchCode?: string
}

export interface InvoiceData {
  documentType?: 'INVOICE' | 'QUOTE'
  invoiceNumber: string
  issuedAt: Date
  dueAt: Date
  status: string
  clientName?: string
  clientEmail?: string
  caseFileNumber?: string
  lineItems: InvoiceLineItem[]
  subtotal: number
  vatRate: number
  vatAmount: number
  total: number
  notes?: string
  reference?: string
  /** Override default banking details (from env vars) with invoice-specific details */
  bankingDetails?: BankingDetails | null
}

function lineItemDescription(item: InvoiceLineItem): string {
  if (item.creditor && item.serviceLabel) return `${item.creditor} — ${item.serviceLabel}`
  if (item.creditor) return item.creditor
  return item.description ?? ''
}

// ---- Colours ----

const EMERALD   = rgb(0.039, 0.722, 0.510)  // #0AB882
const DARK_BG   = rgb(0.118, 0.118, 0.118)  // #1E1E1E
const DARK_TEXT = rgb(0.15, 0.15, 0.15)
const GRAY_TEXT = rgb(0.45, 0.45, 0.45)
const WHITE     = rgb(1, 1, 1)
const LIGHT_ROW = rgb(0.96, 0.96, 0.96)

// ---- Helpers ----

function formatZAR(amount: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2 }).format(amount)
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric' }).format(date)
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str
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
  page.drawText(text, { x, y, font, size, color })
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
  const textWidth = font.widthOfTextAtSize(text, size)
  page.drawText(text, { x: rightEdge - textWidth, y, font, size, color })
}

// ---- Main Export ----

export async function generateInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()

  // A4 dimensions in points
  const W = 595.28
  const H = 841.89
  const MARGIN = 48
  const CONTENT_W = W - MARGIN * 2
  const RIGHT = W - MARGIN

  const page = pdfDoc.addPage([W, H])

  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)

  let cursor = H  // tracks current Y, drawing top-down

  // ─────────────────────────────────────────────
  // 1. HEADER BAND
  // ─────────────────────────────────────────────
  const HEADER_H = 90
  cursor -= HEADER_H

  page.drawRectangle({
    x: 0, y: cursor,
    width: W, height: HEADER_H,
    color: DARK_BG })

  // Company name
  drawText(page, 'ZENOWETHU', MARGIN, cursor + 58, bold, 20, WHITE)
  drawText(page, 'DEBT MANAGEMENT', MARGIN, cursor + 40, regular, 10, rgb(0.7, 0.7, 0.7))
  drawText(page, 'notifications@zenowethu.co.za', MARGIN, cursor + 24, regular, 8, rgb(0.6, 0.6, 0.6))

  // INVOICE / QUOTE label
  const docLabel = data.documentType === 'QUOTE' ? 'QUOTATION' : 'INVOICE'
  drawRightAlignedText(page, docLabel, RIGHT, cursor + 58, bold, 26, EMERALD)
  drawRightAlignedText(page, data.invoiceNumber, RIGHT, cursor + 40, regular, 10, WHITE)
  drawRightAlignedText(page, `Status: ${data.status}`, RIGHT, cursor + 24, regular, 8, rgb(0.7, 0.7, 0.7))

  cursor -= 24  // gap below header

  // ─────────────────────────────────────────────
  // 2. META BLOCK — Bill To (left) | Dates (right)
  // ─────────────────────────────────────────────
  const metaTop = cursor

  // Left: Bill To
  drawText(page, 'BILL TO', MARGIN, metaTop - 12, bold, 8, GRAY_TEXT)
  let leftY = metaTop - 28

  if (data.clientName) {
    drawText(page, data.clientName, MARGIN, leftY, bold, 11, DARK_TEXT)
    leftY -= 16
  } else {
    drawText(page, 'No client specified', MARGIN, leftY, regular, 10, GRAY_TEXT)
    leftY -= 16
  }

  if (data.clientEmail) {
    drawText(page, data.clientEmail, MARGIN, leftY, regular, 9, GRAY_TEXT)
    leftY -= 14
  }
  if (data.caseFileNumber) {
    drawText(page, `Case: ${data.caseFileNumber}`, MARGIN, leftY, regular, 9, GRAY_TEXT)
    leftY -= 14
  }
  if (data.reference) {
    drawText(page, `Ref: ${data.reference}`, MARGIN, leftY, regular, 9, GRAY_TEXT)
  }

  // Right: Dates
  const rightColX = W / 2 + 30
  const detailsLabel = data.documentType === 'QUOTE' ? 'QUOTATION DETAILS' : 'INVOICE DETAILS'
  drawText(page, detailsLabel, rightColX, metaTop - 12, bold, 8, GRAY_TEXT)

  const dueDateLabel = data.documentType === 'QUOTE' ? 'Valid Until' : 'Due Date'
  const metaRows = [
    ['Issue Date', formatDate(data.issuedAt)],
    [dueDateLabel, formatDate(data.dueAt)],
  ]

  let rightY = metaTop - 28
  for (const [label, value] of metaRows) {
    drawText(page, label, rightColX, rightY, regular, 9, GRAY_TEXT)
    drawRightAlignedText(page, value, RIGHT, rightY, regular, 9, DARK_TEXT)
    rightY -= 16
  }

  cursor = Math.min(leftY, rightY) - 20

  // Divider line
  page.drawLine({
    start: { x: MARGIN, y: cursor + 8 },
    end:   { x: RIGHT,  y: cursor + 8 },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85) })

  cursor -= 16

  // ─────────────────────────────────────────────
  // 3. LINE ITEMS TABLE
  // ─────────────────────────────────────────────
  const COL_QTY   = 70
  const COL_PRICE = 100
  const COL_AMT   = 100
  const COL_DESC  = CONTENT_W - COL_QTY - COL_PRICE - COL_AMT

  const TABLE_ROW_H = 22

  // Table header
  page.drawRectangle({
    x: MARGIN, y: cursor - TABLE_ROW_H,
    width: CONTENT_W, height: TABLE_ROW_H,
    color: EMERALD })

  const headerY = cursor - TABLE_ROW_H + 7
  drawText(page, 'DESCRIPTION', MARGIN + 6, headerY, bold, 8, WHITE)
  drawRightAlignedText(page, 'QTY', MARGIN + COL_DESC - 4, headerY, bold, 8, WHITE)
  drawRightAlignedText(page, 'UNIT PRICE', MARGIN + COL_DESC + COL_QTY + COL_PRICE - 4, headerY, bold, 8, WHITE)
  drawRightAlignedText(page, 'AMOUNT', RIGHT - 4, headerY, bold, 8, WHITE)

  cursor -= TABLE_ROW_H

  // Table rows — max 20 per page (Phase 1 guard)
  const displayItems = data.lineItems.slice(0, 20)
  for (let i = 0; i < displayItems.length; i++) {
    const item = displayItems[i]
    const rowY = cursor - TABLE_ROW_H

    // Alternate row background
    if (i % 2 === 1) {
      page.drawRectangle({
        x: MARGIN, y: rowY,
        width: CONTENT_W, height: TABLE_ROW_H,
        color: LIGHT_ROW })
    }

    const textY = rowY + 7
    const lineAmt = item.quantity * item.unitPrice

    drawText(page, truncate(lineItemDescription(item), 55), MARGIN + 6, textY, regular, 9, DARK_TEXT)
    drawRightAlignedText(page, String(item.quantity), MARGIN + COL_DESC - 4, textY, regular, 9, DARK_TEXT)
    drawRightAlignedText(page, formatZAR(item.unitPrice), MARGIN + COL_DESC + COL_QTY + COL_PRICE - 4, textY, regular, 9, DARK_TEXT)
    drawRightAlignedText(page, formatZAR(lineAmt), RIGHT - 4, textY, regular, 9, DARK_TEXT)

    cursor -= TABLE_ROW_H
  }

  if (data.lineItems.length > 20) {
    cursor -= 4
    drawText(page, `+ ${data.lineItems.length - 20} more items (see attached detail sheet)`, MARGIN + 6, cursor, regular, 8, GRAY_TEXT)
    cursor -= 12
  }

  // Bottom border of table
  page.drawLine({
    start: { x: MARGIN, y: cursor },
    end:   { x: RIGHT,  y: cursor },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8) })

  cursor -= 20

  // ─────────────────────────────────────────────
  // 4. TOTALS BLOCK
  // ─────────────────────────────────────────────
  const TOTALS_X = W - MARGIN - 220

  const totalsRows: [string, string, boolean][] = [
    ['Subtotal',                   formatZAR(data.subtotal),  false],
    [`VAT (${Math.round(data.vatRate * 100)}%)`, formatZAR(data.vatAmount), false],
  ]

  for (const [label, value, isBold] of totalsRows) {
    drawText(page, label, TOTALS_X, cursor, isBold ? bold : regular, 9, GRAY_TEXT)
    drawRightAlignedText(page, value, RIGHT, cursor, isBold ? bold : regular, 9, DARK_TEXT)
    cursor -= 16
  }

  // Divider
  page.drawLine({
    start: { x: TOTALS_X, y: cursor + 4 },
    end:   { x: RIGHT,    y: cursor + 4 },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75) })
  cursor -= 12

  // Total (larger, emerald)
  drawText(page, 'TOTAL DUE', TOTALS_X, cursor, bold, 11, DARK_TEXT)
  drawRightAlignedText(page, formatZAR(data.total), RIGHT, cursor, bold, 13, EMERALD)

  cursor -= 40

  // ─────────────────────────────────────────────
  // 5. PAYMENT INSTRUCTIONS
  // ─────────────────────────────────────────────
  page.drawRectangle({
    x: MARGIN, y: cursor - 82,
    width: CONTENT_W, height: 82,
    color: rgb(0.97, 0.97, 0.97),
    borderColor: rgb(0.88, 0.88, 0.88),
    borderWidth: 0.5 })

  drawText(page, 'PAYMENT INSTRUCTIONS', MARGIN + 10, cursor - 14, bold, 8, GRAY_TEXT)

  const bd = data.bankingDetails
  const bankName    = bd?.bankName      ?? process.env.COMPANY_BANK_NAME    ?? 'First National Bank'
  const bankAccount = bd?.accountNumber ?? process.env.COMPANY_BANK_ACCOUNT ?? '— contact us for banking details —'
  const branchCode  = bd?.branchCode    ?? process.env.COMPANY_BRANCH_CODE  ?? ''
  const accountHolder = bd?.accountHolder ?? 'Zenowethu Debt Management (Pty) Ltd'

  const bankRows = [
    ['Bank',            bankName],
    ['Account Name',    accountHolder],
    ['Account Number',  bankAccount],
    ...(branchCode ? [['Branch Code', branchCode]] : []),
    ['Reference',       data.invoiceNumber],
  ]

  let bankY = cursor - 28
  for (const [label, value] of bankRows) {
    drawText(page, `${label}:`, MARGIN + 10, bankY, bold, 8, GRAY_TEXT)
    drawText(page, value, MARGIN + 90, bankY, regular, 8, DARK_TEXT)
    bankY -= 13
  }

  cursor -= 90

  // ─────────────────────────────────────────────
  // 6. NOTES (if present)
  // ─────────────────────────────────────────────
  if (data.notes) {
    cursor -= 12
    drawText(page, 'NOTES', MARGIN, cursor, bold, 8, GRAY_TEXT)
    cursor -= 14
    // Word-wrap notes at ~90 chars
    const words = data.notes.split(' ')
    let line = ''
    for (const word of words) {
      if ((line + ' ' + word).trim().length > 90) {
        drawText(page, line.trim(), MARGIN, cursor, regular, 8, GRAY_TEXT)
        cursor -= 12
        line = word
      } else {
        line = line + ' ' + word
      }
    }
    if (line.trim()) {
      drawText(page, line.trim(), MARGIN, cursor, regular, 8, GRAY_TEXT)
      cursor -= 12
    }
  }

  // ─────────────────────────────────────────────
  // 7. FOOTER
  // ─────────────────────────────────────────────
  const FOOTER_Y = 28

  page.drawLine({
    start: { x: MARGIN, y: FOOTER_Y + 12 },
    end:   { x: RIGHT,  y: FOOTER_Y + 12 },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85) })

  drawText(page, 'Zenowethu Debt Management (Pty) Ltd', MARGIN, FOOTER_Y, regular, 7, GRAY_TEXT)
  drawRightAlignedText(page, 'Page 1 of 1', RIGHT, FOOTER_Y, regular, 7, GRAY_TEXT)

  return pdfDoc.save()
}
