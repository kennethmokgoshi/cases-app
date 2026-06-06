import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib'

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

// Zenowethu brand colours
const NAVY      = rgb(0.043, 0.114, 0.208)  // #0B1D35
const ORANGE    = rgb(0.769, 0.584, 0.227)  // #C4953A
const DARK_TEXT = rgb(0.15, 0.15, 0.15)
const GRAY_TEXT = rgb(0.45, 0.45, 0.45)
const WHITE     = rgb(1, 1, 1)
const LIGHT_ROW = rgb(0.96, 0.96, 0.96)

function formatZAR(amount: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(amount)
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
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

export async function generateInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()

  const W = 595.28
  const H = 841.89
  const MARGIN = 48
  const CONTENT_W = W - MARGIN * 2
  const RIGHT = W - MARGIN

  const page = pdfDoc.addPage([W, H])

  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)

  let cursor = H

  // ─────────────────────────────────────────────
  // 1. LETTERHEAD HEADER BAND (Zenowethu brand)
  // ─────────────────────────────────────────────
  const HEADER_H = 100
  cursor -= HEADER_H

  page.drawRectangle({ x: 0, y: cursor, width: W, height: HEADER_H, color: NAVY })

  // Accent bar on right edge
  page.drawRectangle({ x: W - 6, y: cursor, width: 6, height: HEADER_H, color: ORANGE })

  // Company identity
  drawText(page, 'ZENOWETHU', MARGIN, cursor + 68, bold, 22, WHITE)
  drawText(page, 'DEBT MANAGEMENT (PTY) LTD', MARGIN, cursor + 48, regular, 9, rgb(0.75, 0.75, 0.75))
  drawText(page, 'NCR Reg: NCRDC3693  |  DCASA Member', MARGIN, cursor + 32, regular, 7.5, rgb(0.65, 0.65, 0.65))
  drawText(page, 'Suite 2, 2nd Floor, Central House, 17 Central Road, Mabopane, 0190', MARGIN, cursor + 18, regular, 7, rgb(0.60, 0.60, 0.60))
  drawText(page, 'Tel: +27 12 035 1824  |  info@zenowethu.co.za  |  www.zenowethu.co.za', MARGIN, cursor + 6, regular, 7, rgb(0.60, 0.60, 0.60))

  // Document type label (right side)
  const docLabel = data.documentType === 'QUOTE' ? 'QUOTATION' : 'INVOICE'
  drawRightAlignedText(page, docLabel, RIGHT - 12, cursor + 68, bold, 24, ORANGE)
  drawRightAlignedText(page, data.invoiceNumber, RIGHT - 12, cursor + 46, regular, 10, WHITE)
  drawRightAlignedText(page, `Status: ${data.status}`, RIGHT - 12, cursor + 28, regular, 8, rgb(0.70, 0.70, 0.70))
  if (data.createdByName) {
    drawRightAlignedText(page, `Prepared by: ${data.createdByName}`, RIGHT - 12, cursor + 12, regular, 7, rgb(0.60, 0.60, 0.60))
  }

  cursor -= 20

  // ─────────────────────────────────────────────
  // 2. META BLOCK — Bill To (left) | Dates (right)
  // ─────────────────────────────────────────────
  const metaTop = cursor

  drawText(page, 'BILL TO', MARGIN, metaTop - 12, bold, 8, GRAY_TEXT)
  let leftY = metaTop - 28

  if (data.clientName) {
    drawText(page, data.clientName, MARGIN, leftY, bold, 11, DARK_TEXT)
    leftY -= 16
  } else {
    drawText(page, 'No client specified', MARGIN, leftY, regular, 10, GRAY_TEXT)
    leftY -= 16
  }
  if (data.clientIdNumber) {
    drawText(page, `ID Number: ${data.clientIdNumber}`, MARGIN, leftY, regular, 8.5, GRAY_TEXT)
    leftY -= 13
  }
  if (data.clientEmail) {
    drawText(page, data.clientEmail, MARGIN, leftY, regular, 8.5, GRAY_TEXT)
    leftY -= 13
  }
  if (data.clientPhone) {
    drawText(page, `Tel: ${data.clientPhone}`, MARGIN, leftY, regular, 8.5, GRAY_TEXT)
    leftY -= 13
  }
  if (data.caseFileNumber) {
    drawText(page, `Case: ${data.caseFileNumber}`, MARGIN, leftY, regular, 8.5, GRAY_TEXT)
    leftY -= 13
  }
  if (data.clientAccountNumber) {
    drawText(page, `Account No: ${data.clientAccountNumber}`, MARGIN, leftY, regular, 8.5, GRAY_TEXT)
    leftY -= 13
  }
  if (data.clientCurrentBalance !== undefined) {
    drawText(page, `Current Balance:`, MARGIN, leftY, bold, 8.5, GRAY_TEXT)
    drawText(page, formatZAR(data.clientCurrentBalance), MARGIN + 82, leftY, bold, 8.5, NAVY)
    leftY -= 13
  }
  if (data.reference) {
    drawText(page, `Ref: ${data.reference}`, MARGIN, leftY, regular, 8.5, GRAY_TEXT)
  }

  const rightColX = W / 2 + 30
  const detailsLabel = data.documentType === 'QUOTE' ? 'QUOTATION DETAILS' : 'INVOICE DETAILS'
  drawText(page, detailsLabel, rightColX, metaTop - 12, bold, 8, GRAY_TEXT)

  const dueDateLabel = data.documentType === 'QUOTE' ? 'Valid Until' : 'Due Date'
  const metaRows = [['Issue Date', formatDate(data.issuedAt)], [dueDateLabel, formatDate(data.dueAt)]]

  let rightY = metaTop - 28
  for (const [label, value] of metaRows) {
    drawText(page, label, rightColX, rightY, regular, 9, GRAY_TEXT)
    drawRightAlignedText(page, value, RIGHT, rightY, regular, 9, DARK_TEXT)
    rightY -= 16
  }

  cursor = Math.min(leftY, rightY) - 16

  page.drawLine({ start: { x: MARGIN, y: cursor + 8 }, end: { x: RIGHT, y: cursor + 8 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) })
  cursor -= 16

  // ─────────────────────────────────────────────
  // 3. LINE ITEMS TABLE
  // ─────────────────────────────────────────────
  const COL_QTY   = 70
  const COL_PRICE = 100
  const COL_AMT   = 100
  const COL_DESC  = CONTENT_W - COL_QTY - COL_PRICE - COL_AMT
  const TABLE_ROW_H = 22

  page.drawRectangle({ x: MARGIN, y: cursor - TABLE_ROW_H, width: CONTENT_W, height: TABLE_ROW_H, color: NAVY })

  const headerY = cursor - TABLE_ROW_H + 7
  drawText(page, 'DESCRIPTION', MARGIN + 6, headerY, bold, 8, WHITE)
  drawRightAlignedText(page, 'QTY', MARGIN + COL_DESC - 4, headerY, bold, 8, WHITE)
  drawRightAlignedText(page, 'UNIT PRICE', MARGIN + COL_DESC + COL_QTY + COL_PRICE - 4, headerY, bold, 8, WHITE)
  drawRightAlignedText(page, 'AMOUNT', RIGHT - 4, headerY, bold, 8, WHITE)

  cursor -= TABLE_ROW_H

  const displayItems = data.lineItems.slice(0, 20)
  for (let i = 0; i < displayItems.length; i++) {
    const item = displayItems[i]
    const rowY = cursor - TABLE_ROW_H
    if (i % 2 === 1) { page.drawRectangle({ x: MARGIN, y: rowY, width: CONTENT_W, height: TABLE_ROW_H, color: LIGHT_ROW }) }
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
    drawText(page, `+ ${data.lineItems.length - 20} more items`, MARGIN + 6, cursor, regular, 8, GRAY_TEXT)
    cursor -= 12
  }

  page.drawLine({ start: { x: MARGIN, y: cursor }, end: { x: RIGHT, y: cursor }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) })
  cursor -= 20

  // ─────────────────────────────────────────────
  // 4. TOTALS
  // ─────────────────────────────────────────────
  const TOTALS_X = W - MARGIN - 220
  const totalsRows: [string, string][] = [
    ['Subtotal', formatZAR(data.subtotal)],
    [`VAT (${Math.round(data.vatRate * 100)}%)`, formatZAR(data.vatAmount)],
  ]
  for (const [label, value] of totalsRows) {
    drawText(page, label, TOTALS_X, cursor, regular, 9, GRAY_TEXT)
    drawRightAlignedText(page, value, RIGHT, cursor, regular, 9, DARK_TEXT)
    cursor -= 16
  }
  page.drawLine({ start: { x: TOTALS_X, y: cursor + 4 }, end: { x: RIGHT, y: cursor + 4 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) })
  cursor -= 12
  drawText(page, 'TOTAL DUE', TOTALS_X, cursor, bold, 11, DARK_TEXT)
  drawRightAlignedText(page, formatZAR(data.total), RIGHT, cursor, bold, 13, ORANGE)
  cursor -= 40

  // ─────────────────────────────────────────────
  // 5. PAYMENT INSTRUCTIONS
  // ─────────────────────────────────────────────
  const bankName    = data.bankName         || process.env.COMPANY_BANK_NAME    || 'CAPITEC BUSINESS'
  const bankAccount = data.bankAccountNumber || process.env.COMPANY_BANK_ACCOUNT || '105 181 8346'
  const branchCode  = data.branchCode       || process.env.COMPANY_BRANCH_CODE  || '450105'
  const accountName = data.bankAccountName   || 'Zenowethu Debt Management (Pty) Ltd'

  const bankRows: [string, string][] = [
    ['Bank',           bankName],
    ['Account Name',   accountName],
    ['Account Number', bankAccount],
    ...(branchCode ? [['Branch Code', branchCode] as [string, string]] : []),
    ['VAT Number',     process.env.COMPANY_VAT_NUMBER || '4590307072'],
    ['Reference',      data.invoiceNumber],
  ]

  const bankBlockH = 14 + bankRows.length * 13
  page.drawRectangle({ x: MARGIN, y: cursor - bankBlockH, width: CONTENT_W, height: bankBlockH, color: rgb(0.97, 0.97, 0.97), borderColor: rgb(0.88, 0.88, 0.88), borderWidth: 0.5 })
  drawText(page, 'PAYMENT INSTRUCTIONS', MARGIN + 10, cursor - 12, bold, 8, GRAY_TEXT)

  let bankY = cursor - 26
  for (const [label, value] of bankRows) {
    drawText(page, `${label}:`, MARGIN + 10, bankY, bold, 8, GRAY_TEXT)
    drawText(page, value, MARGIN + 100, bankY, regular, 8, DARK_TEXT)
    bankY -= 13
  }
  cursor -= bankBlockH + 8

  // ─────────────────────────────────────────────
  // 6. NOTES
  // ─────────────────────────────────────────────
  if (data.notes) {
    cursor -= 12
    drawText(page, 'NOTES', MARGIN, cursor, bold, 8, GRAY_TEXT)
    cursor -= 14
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
    if (line.trim()) { drawText(page, line.trim(), MARGIN, cursor, regular, 8, GRAY_TEXT); cursor -= 12 }
  }

  // ─────────────────────────────────────────────
  // 7. FOOTER — Zenowethu signature block
  // ─────────────────────────────────────────────
  const FOOTER_Y = 40
  page.drawLine({ start: { x: MARGIN, y: FOOTER_Y + 28 }, end: { x: RIGHT, y: FOOTER_Y + 28 }, thickness: 0.5, color: ORANGE })
  drawText(page, 'Aaron Nzotho | NCRDC3693 | Suite 2, 2nd Floor, Central House, 17 Central Road, Mabopane, 0190', MARGIN, FOOTER_Y + 16, regular, 6.5, GRAY_TEXT)
  drawText(page, 'Tel: +27 12 035 1824  |  Cell: 082 363 8207  |  info@zenowethu.co.za  |  www.zenowethu.co.za  |  Member of DCASA', MARGIN, FOOTER_Y + 4, regular, 6.5, GRAY_TEXT)
  drawRightAlignedText(page, 'Page 1 of 1', RIGHT, FOOTER_Y + 4, regular, 7, GRAY_TEXT)

  return pdfDoc.save()
}
