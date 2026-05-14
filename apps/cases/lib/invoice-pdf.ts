import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib'
import fs, { existsSync, readFileSync } from 'fs'
import path, { join } from 'path'

// ---- Types ----

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
  caseFileNumber?: string
  bankAccount?: {
    bankName: string
    accountName: string
    accountNumber: string
    accountType?: string
    branchCode?: string
  }
  lineItems: InvoiceLineItem[]
  subtotal: number
  vatRate: number
  vatAmount: number
  total: number
  notes?: string
  reference?: string
}

function lineItemDescription(item: InvoiceLineItem): string {
  const label = item.serviceLabel || ''
  const cred  = item.creditor || ''
  
  if (!cred || cred.toLowerCase().trim() === label.toLowerCase().trim()) {
    return label || item.description || ''
  }
  
  if (cred && label) return `${cred} — ${label}`
  return cred || label || item.description || ''
}

// ---- Colours (Premium Executive Palette) ----
const PRIMARY_NAVY = rgb(0.05, 0.1, 0.25)    // #0d1a40
const ACCENT_EMERALD = rgb(0.06, 0.65, 0.45) // #10a673
const DARK_TEXT = rgb(0.1, 0.1, 0.1)
const GRAY_TEXT = rgb(0.4, 0.4, 0.4)
const LIGHT_GRAY = rgb(0.96, 0.96, 0.97)
const BORDER_COLOR = rgb(0.85, 0.85, 0.87)
const WHITE = rgb(1, 1, 1)
const LIGHT_ROW = rgb(0.97, 0.97, 0.98)

// ---- Helpers ----

async function loadLetterhead(): Promise<Uint8Array> {
  const candidates = [
    join(process.cwd(), 'public', 'templates', 'poa', 'Letterhead.pdf'),
    join(process.cwd(), '..', '..', 'letterhead', 'Letter head Clean.pdf'),
    join(process.cwd(), 'apps', 'cases', 'public', 'templates', 'poa', 'Letterhead.pdf'),
    'C:\\Visual Studio Code\\06 March 2026\\letterhead\\Letter head Clean.pdf',
  ];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p);
  }
  throw new Error(`Letterhead not found. Searched:\n${candidates.join('\n')}`);
}

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

function wrapText(text: string, maxWidth: number, font: PDFFont, fontSize: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    const width = font.widthOfTextAtSize(testLine, fontSize)
    if (width <= maxWidth) {
      currentLine = testLine
    } else {
      if (currentLine) lines.push(currentLine)
      currentLine = word
    }
  }
  if (currentLine) lines.push(currentLine)
  return lines
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

  const W = 595.28
  const H = 841.89
  const MARGIN = 48
  const CONTENT_W = W - MARGIN * 2
  const RIGHT = W - MARGIN

  const page = pdfDoc.addPage([W, H])

  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const italic  = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)

  // 0. EMBED LETTERHEAD
  let letterheadPage;
  try {
    const lhBytes = await loadLetterhead()
    const lhDoc = await PDFDocument.load(lhBytes, { ignoreEncryption: true })
    const [embeddedPage] = await pdfDoc.embedPdf(lhDoc)
    letterheadPage = embeddedPage
  } catch (e) {
    console.error('Letterhead load failed:', e)
  }

  let cursor = H 

  if (letterheadPage) {
    page.drawPage(letterheadPage, {
      x: 0,
      y: 0,
      width: W,
      height: H
    })
    // Move cursor down to avoid overlapping standard letterhead top content
    cursor -= 140
  } else {
    // 1. HEADER BRANDING (Fallback if no letterhead)
    const HEADER_H = 100
    cursor -= HEADER_H
   
    page.drawRectangle({
      x: 0, y: cursor,
      width: W, height: HEADER_H,
      color: PRIMARY_NAVY })
   
    drawText(page, 'ZENOWETHU', MARGIN, cursor + 62, bold, 22, WHITE)
    drawText(page, 'PROFESSIONAL DEBT MANAGEMENT', MARGIN, cursor + 45, regular, 9, rgb(0.8, 0.8, 0.8))
    drawText(page, 'www.zenowethu.co.za', MARGIN, cursor + 30, regular, 8, rgb(0.6, 0.6, 0.6))
  }
 
  const docLabel = data.documentType === 'QUOTE' ? 'QUOTATION' : 'TAX INVOICE'
  
  // Adjusted positioning for branded feel
  const labelY = letterheadPage ? cursor + 40 : cursor + 62
  const refY = letterheadPage ? cursor + 23 : cursor + 45
  const statusY = letterheadPage ? cursor + 4 : cursor + 30

  drawRightAlignedText(page, docLabel, RIGHT, labelY, bold, 24, ACCENT_EMERALD)
  drawRightAlignedText(page, `REF: ${data.invoiceNumber}`, RIGHT, refY, regular, 10, letterheadPage ? DARK_TEXT : WHITE)
  
  cursor -= 40 

  // 2. META BLOCK
  const metaTop = cursor
  drawText(page, 'BILL TO', MARGIN, metaTop - 12, bold, 8, GRAY_TEXT)
  let leftY = metaTop - 28

  if (data.clientName) {
    drawText(page, data.clientName, MARGIN, leftY, bold, 11, DARK_TEXT)
    leftY -= 16
  }

  if (data.clientEmail) {
    drawText(page, data.clientEmail, MARGIN, leftY, regular, 9, GRAY_TEXT)
    leftY -= 14
  }

  const rightColX = W / 2 + 30
  const detailsLabel = data.documentType === 'QUOTE' ? 'QUOTATION DETAILS' : 'INVOICE DETAILS'
  drawText(page, detailsLabel, rightColX, metaTop - 12, bold, 8, GRAY_TEXT)

  const dueDateLabel = data.documentType === 'QUOTE' ? 'Valid Until' : 'Due Date'
  const metaRows = [
    ['Issue Date', formatDate(data.issuedAt || new Date())],
    [dueDateLabel, formatDate(data.dueAt || new Date())],
  ]

  let rightY = metaTop - 28
  for (const [label, value] of metaRows) {
    drawText(page, label, rightColX, rightY, regular, 9, GRAY_TEXT)
    drawRightAlignedText(page, value, RIGHT, rightY, regular, 9, DARK_TEXT)
    rightY -= 16
  }

  cursor = Math.min(leftY, rightY) - 20
  page.drawLine({ start: { x: MARGIN, y: cursor + 8 }, end: { x: RIGHT, y: cursor + 8 }, thickness: 0.5, color: BORDER_COLOR })
  cursor -= 16

  // 3. TABLE
  const COL_QTY   = 40
  const COL_PRICE = 90
  const COL_AMT   = 90
  const COL_DESC  = CONTENT_W - COL_QTY - COL_PRICE - COL_AMT
  const TABLE_ROW_H = 32
 
  page.drawRectangle({ x: MARGIN, y: cursor - TABLE_ROW_H, width: CONTENT_W, height: TABLE_ROW_H, color: PRIMARY_NAVY })
  const headerY = cursor - TABLE_ROW_H + 12
  drawText(page, 'DESCRIPTION OF SERVICES RENDERED', MARGIN + 10, headerY, bold, 8, WHITE)
  drawRightAlignedText(page, 'QTY', MARGIN + COL_DESC + COL_QTY - 10, headerY, bold, 8, WHITE)
  drawRightAlignedText(page, 'UNIT PRICE', MARGIN + COL_DESC + COL_QTY + COL_PRICE - 10, headerY, bold, 8, WHITE)
  drawRightAlignedText(page, 'TOTAL', RIGHT - 10, headerY, bold, 8, WHITE)

  cursor -= TABLE_ROW_H

  for (let i = 0; i < data.lineItems.length; i++) {
    const item = data.lineItems[i]
    
    // Prepare wrapped text
    const descWidth = COL_DESC - 20
    const mainTitleLines = wrapText(lineItemDescription(item), descWidth, bold, 9)
    const subTextLines = item.description ? wrapText(item.description, descWidth, regular, 7.5) : []
    
    // Calculate required height for this row
    const totalLines = mainTitleLines.length + subTextLines.length
    const rowHeight = Math.max(TABLE_ROW_H, (totalLines * 12) + 15)
    
    const rowY = cursor - rowHeight
    if (i % 2 === 1) page.drawRectangle({ x: MARGIN, y: rowY, width: CONTENT_W, height: rowHeight, color: LIGHT_ROW })
    
    // Vertically center the QTY and Price against the description block
    const textBlockHeight = (mainTitleLines.length * 11) + (subTextLines.length * 9)
    const verticalPadding = (rowHeight - textBlockHeight) / 2
    const textTopY = cursor - verticalPadding - 8
    
    const lineAmt = item.quantity * item.unitPrice
    
    // Draw Main Title Lines
    let lineCursor = textTopY
    for (const line of mainTitleLines) {
      drawText(page, line, MARGIN + 10, lineCursor, bold, 9, DARK_TEXT)
      lineCursor -= 11
    }
    
    // Draw Sub-text Lines
    lineCursor -= 1 
    for (const line of subTextLines) {
      drawText(page, line, MARGIN + 10, lineCursor, regular, 7.5, GRAY_TEXT)
      lineCursor -= 9
    }

    // Numbers (Vertically Centered)
    const numberY = cursor - (rowHeight / 2) + 2
    drawRightAlignedText(page, String(item.quantity), MARGIN + COL_DESC + COL_QTY - 10, numberY, regular, 9, DARK_TEXT)
    
    // Price with (excl. VAT) detail
    drawRightAlignedText(page, formatZAR(item.unitPrice), MARGIN + COL_DESC + COL_QTY + COL_PRICE - 10, numberY + 4, regular, 9, DARK_TEXT)
    drawRightAlignedText(page, '(excl. VAT)', MARGIN + COL_DESC + COL_QTY + COL_PRICE - 10, numberY - 5, regular, 6.5, GRAY_TEXT)
    
    drawRightAlignedText(page, formatZAR(lineAmt), RIGHT - 10, numberY, bold, 9, DARK_TEXT)

    cursor -= rowHeight
  }

  page.drawLine({ start: { x: MARGIN, y: cursor }, end: { x: RIGHT, y: cursor }, thickness: 0.5, color: BORDER_COLOR })
  cursor -= 20

  // 4. TOTALS
  const TOTALS_X = W - MARGIN - 220
  const totalsRows = [
    ['Subtotal (Excl)', formatZAR(data.subtotal), false],
    [`VAT (${Math.round(data.vatRate * 100)}%)`, formatZAR(data.vatAmount), false],
  ]

  for (const [label, value, isBold] of totalsRows) {
    drawText(page, label, TOTALS_X, cursor, isBold ? bold : regular, 9, GRAY_TEXT)
    drawRightAlignedText(page, value, RIGHT - 10, cursor, isBold ? bold : regular, 9, DARK_TEXT)
    cursor -= 16
  }
 
  cursor -= 12
  page.drawRectangle({ x: TOTALS_X - 10, y: cursor - 8, width: RIGHT - TOTALS_X + 10, height: 32, color: PRIMARY_NAVY })
  const finalTotalY = cursor + 5
  drawText(page, 'TOTAL DUE (INCL)', TOTALS_X, finalTotalY, bold, 11, WHITE)
  drawRightAlignedText(page, formatZAR(data.total), RIGHT - 10, finalTotalY, bold, 18, ACCENT_EMERALD)

  cursor -= 60

  // 5. BANKING
  if (data.bankAccount) {
    // Increased height to 90 for better visibility
    page.drawRectangle({ x: MARGIN, y: cursor - 90, width: 320, height: 90, color: LIGHT_GRAY, borderColor: BORDER_COLOR, borderWidth: 0.5 })
    page.drawLine({ start: { x: MARGIN, y: cursor }, end: { x: MARGIN + 320, y: cursor }, thickness: 2.5, color: ACCENT_EMERALD })
    
    let bankY = cursor - 18
    drawText(page, 'PAYMENT INSTRUCTIONS', MARGIN + 12, bankY, bold, 11, ACCENT_EMERALD)
    bankY -= 22
    const bank = data.bankAccount
    drawText(page, `${bank.bankName} - ${bank.accountNumber}`, MARGIN + 12, bankY, bold, 14, DARK_TEXT)
    bankY -= 18
    drawText(page, `Acc Name: ${bank.accountName}`, MARGIN + 12, bankY, regular, 10, GRAY_TEXT)
    if (bank.branchCode) drawText(page, `Branch: ${bank.branchCode}`, MARGIN + 12, bankY - 14, regular, 10, GRAY_TEXT)
  }

  return pdfDoc.save()
}
