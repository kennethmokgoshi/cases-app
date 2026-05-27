import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

// ---- Types ----

export interface CommissionStatementLine {
  caseClientName: string
  caseIdNumber?: string
  commissionAmount: number
  status: string
  paidAt?: Date | null
  paymentRef?: string | null
}

export interface CommissionStatementData {
  statementNumber: string
  issuedAt: Date
  referrerName: string
  referrerIdNumber?: string
  referrerEmail?: string
  bankAccount?: {
    bankName: string
    accountNumber: string
    branchCode?: string
    accountHolderName?: string
  }
  lineItems: CommissionStatementLine[]
  totalPaid: number
  totalUnpaid: number
  totalCommission: number
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

export async function generateCommissionStatementPdf(data: CommissionStatementData): Promise<Uint8Array> {
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
    cursor -= 140
  } else {
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
 
  const docLabel = 'COMMISSION STATEMENT'
  const labelY = letterheadPage ? cursor + 40 : cursor + 62
  const refY = letterheadPage ? cursor + 23 : cursor + 45

  drawRightAlignedText(page, docLabel, RIGHT, labelY, bold, 20, PRIMARY_NAVY)
  drawRightAlignedText(page, `STMT: ${data.statementNumber}`, RIGHT, refY, regular, 10, letterheadPage ? DARK_TEXT : WHITE)
  
  cursor -= 40 

  // 2. META BLOCK
  const metaTop = cursor
  drawText(page, 'REFERRER DETAILS', MARGIN, metaTop - 12, bold, 8, GRAY_TEXT)
  let leftY = metaTop - 28

  drawText(page, data.referrerName, MARGIN, leftY, bold, 11, DARK_TEXT)
  leftY -= 16

  if (data.referrerIdNumber) {
    drawText(page, `ID: ${data.referrerIdNumber}`, MARGIN, leftY, regular, 9, GRAY_TEXT)
    leftY -= 14
  }
  if (data.referrerEmail) {
    drawText(page, data.referrerEmail, MARGIN, leftY, regular, 9, GRAY_TEXT)
    leftY -= 14
  }

  const rightColX = W / 2 + 30
  drawText(page, 'STATEMENT DETAILS', rightColX, metaTop - 12, bold, 8, GRAY_TEXT)

  const metaRows = [
    ['Issue Date', formatDate(data.issuedAt || new Date())],
    ['Total Cases', String(data.lineItems.length)],
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
  const COL_CLIENT = 160
  const COL_STATUS = 120
  const COL_REF    = 120
  const COL_AMT    = CONTENT_W - COL_CLIENT - COL_STATUS - COL_REF
  const TABLE_ROW_H = 28
 
  page.drawRectangle({ x: MARGIN, y: cursor - TABLE_ROW_H, width: CONTENT_W, height: TABLE_ROW_H, color: PRIMARY_NAVY })
  const headerY = cursor - TABLE_ROW_H + 10
  
  drawText(page, 'CLIENT', MARGIN + 10, headerY, bold, 8, WHITE)
  drawText(page, 'STATUS', MARGIN + COL_CLIENT + 10, headerY, bold, 8, WHITE)
  drawText(page, 'PAYMENT REF', MARGIN + COL_CLIENT + COL_STATUS + 10, headerY, bold, 8, WHITE)
  drawRightAlignedText(page, 'AMOUNT', RIGHT - 10, headerY, bold, 8, WHITE)

  cursor -= TABLE_ROW_H

  for (let i = 0; i < data.lineItems.length; i++) {
    const item = data.lineItems[i]
    
    // add new page if needed
    if (cursor < 100) {
      // not handling multiple pages properly here, but keeping it simple for now
    }

    const rowY = cursor - TABLE_ROW_H
    if (i % 2 === 1) page.drawRectangle({ x: MARGIN, y: rowY, width: CONTENT_W, height: TABLE_ROW_H, color: LIGHT_ROW })
    
    const textY = cursor - 18
    
    drawText(page, truncate(item.caseClientName, 30), MARGIN + 10, textY, bold, 9, DARK_TEXT)
    
    const statusColor = item.status === 'PAID' ? ACCENT_EMERALD : rgb(0.8, 0.4, 0)
    drawText(page, item.status, MARGIN + COL_CLIENT + 10, textY, bold, 8, statusColor)
    
    const refText = item.paymentRef ? item.paymentRef : (item.status === 'UNPAID' ? 'Pending' : '-')
    drawText(page, truncate(refText, 25), MARGIN + COL_CLIENT + COL_STATUS + 10, textY, regular, 8, GRAY_TEXT)
    
    drawRightAlignedText(page, formatZAR(item.commissionAmount), RIGHT - 10, textY, regular, 9, DARK_TEXT)

    cursor -= TABLE_ROW_H
  }

  page.drawLine({ start: { x: MARGIN, y: cursor }, end: { x: RIGHT, y: cursor }, thickness: 0.5, color: BORDER_COLOR })
  cursor -= 20

  // 4. TOTALS
  const TOTALS_X = W - MARGIN - 220
  const totalsRows: [string, string, boolean, ReturnType<typeof rgb> | undefined][] = [
    ['Total Paid', formatZAR(data.totalPaid), false, ACCENT_EMERALD],
    ['Total Unpaid', formatZAR(data.totalUnpaid), false, rgb(0.8, 0.4, 0)],
  ]

  for (const [label, value, isBold, color] of totalsRows) {
    drawText(page, label, TOTALS_X, cursor, isBold ? bold : regular, 9, color || GRAY_TEXT)
    drawRightAlignedText(page, value, RIGHT - 10, cursor, isBold ? bold : regular, 9, color === ACCENT_EMERALD ? color : DARK_TEXT)
    cursor -= 16
  }
 
  cursor -= 12
  page.drawRectangle({ x: TOTALS_X - 10, y: cursor - 8, width: RIGHT - TOTALS_X + 10, height: 32, color: PRIMARY_NAVY })
  const finalTotalY = cursor + 5
  drawText(page, 'TOTAL COMMISSION', TOTALS_X, finalTotalY, bold, 10, WHITE)
  drawRightAlignedText(page, formatZAR(data.totalCommission), RIGHT - 10, finalTotalY, bold, 14, WHITE)

  cursor -= 60

  // 5. BANKING
  if (data.bankAccount && data.bankAccount.bankName) {
    page.drawRectangle({ x: MARGIN, y: cursor - 70, width: 320, height: 70, color: LIGHT_GRAY, borderColor: BORDER_COLOR, borderWidth: 0.5 })
    page.drawLine({ start: { x: MARGIN, y: cursor }, end: { x: MARGIN + 320, y: cursor }, thickness: 2.5, color: PRIMARY_NAVY })
    
    let bankY = cursor - 18
    drawText(page, 'REFERRER BANKING DETAILS', MARGIN + 12, bankY, bold, 9, PRIMARY_NAVY)
    bankY -= 20
    const bank = data.bankAccount
    drawText(page, `${bank.bankName} - ${bank.accountNumber}`, MARGIN + 12, bankY, bold, 12, DARK_TEXT)
    bankY -= 14
    if (bank.accountHolderName) drawText(page, `Acc Name: ${bank.accountHolderName}`, MARGIN + 12, bankY, regular, 9, GRAY_TEXT)
    if (bank.branchCode) drawText(page, `Branch: ${bank.branchCode}`, MARGIN + 12, bankY - 12, regular, 9, GRAY_TEXT)
  }

  return pdfDoc.save()
}
