import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage, PDFEmbeddedPage } from 'pdf-lib'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

// ---- Types ----

export interface InvoiceLineItem {
  description?: string
  creditor?: string
  serviceKey?: string
  serviceLabel?: string
  balance?: number
  discount?: number
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
  /**
   * When set, the BILL TO block renders this party (e.g. a debt counsellor)
   * instead of the consumer — used for DC fee invoices/quotations.
   */
  billTo?: { name: string; tradingName?: string; email?: string } | null
  /** Optional "RE:" subline under BILL TO (e.g. the consumer the fees relate to). */
  reLine?: string
  /** Override default banking details (from env vars) with invoice-specific details */
  bankingDetails?: BankingDetails | null
}

function lineItemDescription(item: InvoiceLineItem): string {
  if (item.description) return item.description
  if (item.creditor && item.balance != null) {
    const bal = formatZAR(item.balance)
    return `Remove ${item.creditor} that has a balance of '${bal}' from all Major Credit bureaus`
  }
  if (item.creditor && item.serviceLabel) return `${item.creditor} — ${item.serviceLabel}`
  if (item.creditor) return item.creditor
  return ''
}

// ── Zenowethu brand colours ────────────────────────────────────────────────────
const NAVY       = rgb(0.043, 0.114, 0.208)  // #0B1D35
const ORANGE     = rgb(0.769, 0.584, 0.227)  // #C4953A
const DARK_TEXT  = rgb(0.15,  0.15,  0.15)
const GRAY_TEXT  = rgb(0.45,  0.45,  0.45)
const WHITE      = rgb(1, 1, 1)
const LIGHT_ROW  = rgb(0.96,  0.96,  0.96)
const GREEN_TEXT = rgb(0.0,   0.50,  0.20)

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

/**
 * Word-wrap: splits text into lines that fit within maxWidth using real font metrics.
 */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return ['']
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
    } else {
      if (current) lines.push(current)
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let partial = ''
        for (const ch of word) {
          if (font.widthOfTextAtSize(partial + ch, size) <= maxWidth) {
            partial += ch
          } else {
            if (partial) lines.push(partial)
            partial = ch
          }
        }
        current = partial
      } else {
        current = word
      }
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
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

// ── Letterhead loader ─────────────────────────────────────────────────────────
// Finance app tries cases app's public folder as well (same Docker image)
async function tryLoadLetterhead(): Promise<Uint8Array | null> {
  const candidates = [
    join(process.cwd(), 'public', 'templates', 'poa', 'Letterhead.pdf'),
    join(process.cwd(), '..', 'cases', 'public', 'templates', 'poa', 'Letterhead.pdf'),
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

  const W         = 595.28   // A4 width in points
  const H         = 841.89   // A4 height in points
  const MARGIN    = 52
  const RIGHT     = W - MARGIN
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

  // Safe-area boundaries (same for every page)
  const CONTENT_TOP    = letterhead ? 655 : (H - 100 - 16)
  const CONTENT_BOTTOM = letterhead ? 148 : (38 + 36)
  const HEADER_H       = 100   // only used in fallback
  const FY             = 38    // footer Y in fallback

  // ── Column widths ─────────────────────────────────────────────────────────
  const hasDiscounts  = data.lineItems.some(l => (l.discount ?? 0) > 0)
  const totalDiscount = data.lineItems.reduce((s, l) => s + (l.discount ?? 0), 0)

  const COL_QTY   = 35
  const COL_PRICE = 80
  const COL_DISC  = hasDiscounts ? 75 : 0
  const COL_AMT   = 85
  const COL_DESC  = CONTENT_W - COL_QTY - COL_PRICE - COL_DISC - COL_AMT

  const R_QTY   = MARGIN + COL_DESC + COL_QTY
  const R_PRICE = R_QTY  + COL_PRICE
  const R_DISC  = R_PRICE + COL_DISC

  // ── Text layout constants ─────────────────────────────────────────────────
  const DESC_SIZE  = 7.5
  const LINE_H     = 11
  const ROW_V_PAD  = 5
  const MIN_ROW_H  = 20
  const DESC_MAX_W = COL_DESC - 10
  const HDR_H      = 19

  // ── Banking details ───────────────────────────────────────────────────────
  // Fallback is Zenowethu's FNB account — only used if the caller (which should
  // normally resolve via resolveInvoiceBankingDetails in @zenowethu/shared-lib)
  // didn't supply bankingDetails at all.
  const bd          = data.bankingDetails
  const bankName    = bd?.bankName      ?? process.env.COMPANY_BANK_NAME    ?? 'FNB'
  const bankAccount = bd?.accountNumber ?? process.env.COMPANY_BANK_ACCOUNT ?? '62867268635'
  const branchCode  = bd?.branchCode    ?? process.env.COMPANY_BRANCH_CODE  ?? '250655'
  const acctHolder  = bd?.accountHolder ?? 'Zenowethu Trading Debt Management (PTY) LTD'

  const bankRows: [string, string][] = [
    ['Bank',           bankName],
    ['Account Name',   acctHolder],
    ['Account Number', bankAccount],
    ...(branchCode ? [['Branch Code', branchCode] as [string, string]] : []),
    ['VAT Number',     process.env.COMPANY_VAT_NUMBER ?? '4590307072'],
    ['Reference',      data.reference || data.invoiceNumber],
  ]

  const noteLines = data.notes ? wrapText(data.notes, regular, 7.5, CONTENT_W) : []

  // Conservative upper-bound for the totals + bank + notes block height
  const TOTALS_H =
    (hasDiscounts && totalDiscount > 0 ? 14 : 0) +
    14 + 14 +                            // subtotal + vat
    16 + 24 +                            // divider + total-due line
    8 + 14 + bankRows.length * 12 + 8 +  // bank box
    (noteLines.length > 0 ? 22 + noteLines.length * 11 : 0) +
    24                                   // safety buffer

  // ── Shared page state ─────────────────────────────────────────────────────
  const allPages: PDFPage[] = []
  let page!: PDFPage
  let cursor = 0

  const docLabel = data.documentType === 'QUOTE' ? 'QUOTATION' : 'INVOICE'

  // ── Page factory ──────────────────────────────────────────────────────────
  function addPage(showTableHeader: boolean): void {
    page = pdfDoc.addPage([W, H])
    allPages.push(page)

    if (letterhead) {
      page.drawPage(letterhead, { x: 0, y: 0, width: W, height: H })
    } else {
      page.drawRectangle({ x: 0, y: H - HEADER_H, width: W, height: HEADER_H, color: NAVY })
      page.drawRectangle({ x: W - 6, y: H - HEADER_H, width: 6, height: HEADER_H, color: ORANGE })
      drawText(page, 'ZENOWETHU', MARGIN, H - 32, bold, 22, WHITE)
      drawText(page, 'DEBT MANAGEMENT (PTY) LTD', MARGIN, H - 50, regular, 9, rgb(0.75, 0.75, 0.75))
      drawText(page, 'NCR Reg: NCRDC3693  |  DCASA Member', MARGIN, H - 64, regular, 7.5, rgb(0.65, 0.65, 0.65))
      drawText(page, 'Suite 2, 2nd Floor, Central House, 17 Central Road, Mabopane, 0190', MARGIN, H - 76, regular, 7, rgb(0.60, 0.60, 0.60))
      drawText(page, 'Tel: +27 12 035 1824  |  info@zenowethu.co.za  |  www.zenowethu.co.za', MARGIN, H - 88, regular, 7, rgb(0.60, 0.60, 0.60))
      page.drawLine({ start: { x: MARGIN, y: FY + 26 }, end: { x: RIGHT, y: FY + 26 }, thickness: 0.5, color: ORANGE })
      drawText(page, 'Aaron Nzotho | NCRDC3693 | Suite 2, 2nd Floor, Central House, 17 Central Road, Mabopane, 0190', MARGIN, FY + 14, regular, 6.5, GRAY_TEXT)
      drawText(page, 'Tel: +27 12 035 1824  |  Cell: 082 363 8207  |  info@zenowethu.co.za  |  www.zenowethu.co.za  |  Member of DCASA', MARGIN, FY + 2, regular, 6.5, GRAY_TEXT)
    }

    cursor = CONTENT_TOP

    if (allPages.length > 1) {
      drawText(page, `${docLabel} ${data.invoiceNumber} — continued`, MARGIN, cursor - 2, bold, 9, ORANGE)
      cursor -= 22
    }

    if (showTableHeader) {
      page.drawRectangle({ x: MARGIN, y: cursor - HDR_H, width: CONTENT_W, height: HDR_H, color: NAVY })
      const hY = cursor - HDR_H + 6
      drawText(page, 'DESCRIPTION',  MARGIN + 5,  hY, bold, 7.5, WHITE)
      drawRightAlignedText(page, 'QTY',        R_QTY - 4,   hY, bold, 7.5, WHITE)
      drawRightAlignedText(page, 'UNIT PRICE', R_PRICE - 4, hY, bold, 7.5, WHITE)
      if (hasDiscounts) drawRightAlignedText(page, 'DISCOUNT', R_DISC - 4, hY, bold, 7.5, WHITE)
      drawRightAlignedText(page, 'AMOUNT',     RIGHT - 4,   hY, bold, 7.5, WHITE)
      cursor -= HDR_H
    }
  }

  // ── PAGE 1 ────────────────────────────────────────────────────────────────
  addPage(false)

  // 1. Document title block
  drawRightAlignedText(page, docLabel, RIGHT, cursor - 2, bold, 20, ORANGE)
  drawRightAlignedText(page, data.invoiceNumber, RIGHT, cursor - 20, regular, 9, DARK_TEXT)
  drawRightAlignedText(page, `Status: ${data.status}`, RIGHT, cursor - 34, regular, 8, GRAY_TEXT)
  if (data.createdByName) {
    drawRightAlignedText(page, `Prepared by: ${data.createdByName}`, RIGHT, cursor - 48, regular, 7.5, GRAY_TEXT)
  }

  // 2. BILL TO (left) | Details (right)
  const metaTop = cursor
  drawText(page, 'BILL TO', MARGIN, metaTop - 12, bold, 7.5, GRAY_TEXT)
  let leftY = metaTop - 26

  if (data.billTo) {
    // DC fee invoice/quote: bill the debt counsellor, reference the consumer below.
    drawText(page, data.billTo.name, MARGIN, leftY, bold, 11, DARK_TEXT)
    leftY -= 15
    if (data.billTo.tradingName) {
      drawText(page, `t/a ${data.billTo.tradingName}`, MARGIN, leftY, regular, 8.5, GRAY_TEXT)
      leftY -= 12
    }
    if (data.billTo.email) {
      drawText(page, data.billTo.email, MARGIN, leftY, regular, 8.5, GRAY_TEXT)
      leftY -= 12
    }
    if (data.reLine) {
      for (const line of wrapText(data.reLine, regular, 8.5, W / 2 - MARGIN)) {
        drawText(page, line, MARGIN, leftY, regular, 8.5, NAVY)
        leftY -= 12
      }
    }
    if (data.caseFileNumber) {
      drawText(page, `Case: ${data.caseFileNumber}`, MARGIN, leftY, regular, 8.5, GRAY_TEXT)
      leftY -= 12
    }
  } else if (data.clientName) {
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

  const rightColX = W / 2 + 20
  drawText(page, data.documentType === 'QUOTE' ? 'QUOTATION DETAILS' : 'INVOICE DETAILS', rightColX, metaTop - 62, bold, 7.5, GRAY_TEXT)
  let rightY = metaTop - 76
  for (const [label, value] of [
    ['Issue Date',  formatDate(data.issuedAt)],
    [data.documentType === 'QUOTE' ? 'Valid Until' : 'Due Date', formatDate(data.dueAt)],
  ]) {
    drawText(page, label, rightColX, rightY, regular, 9, GRAY_TEXT)
    drawRightAlignedText(page, value, RIGHT, rightY, regular, 9, DARK_TEXT)
    rightY -= 14
  }

  cursor = Math.min(leftY, rightY) - 12
  page.drawLine({
    start: { x: MARGIN, y: cursor + 6 }, end: { x: RIGHT, y: cursor + 6 },
    thickness: 0.4, color: rgb(0.82, 0.82, 0.82),
  })
  cursor -= 12

  // 3. Table header (page 1)
  page.drawRectangle({ x: MARGIN, y: cursor - HDR_H, width: CONTENT_W, height: HDR_H, color: NAVY })
  const hY0 = cursor - HDR_H + 6
  drawText(page, 'DESCRIPTION',  MARGIN + 5,  hY0, bold, 7.5, WHITE)
  drawRightAlignedText(page, 'QTY',        R_QTY - 4,   hY0, bold, 7.5, WHITE)
  drawRightAlignedText(page, 'UNIT PRICE', R_PRICE - 4, hY0, bold, 7.5, WHITE)
  if (hasDiscounts) drawRightAlignedText(page, 'DISCOUNT', R_DISC - 4, hY0, bold, 7.5, WHITE)
  drawRightAlignedText(page, 'AMOUNT',     RIGHT - 4,   hY0, bold, 7.5, WHITE)
  cursor -= HDR_H

  // ── 4. LINE ITEMS — paginate automatically ────────────────────────────────
  let rowIndex = 0

  for (let i = 0; i < data.lineItems.length; i++) {
    const item      = data.lineItems[i]
    const descText  = lineItemDescription(item)
    const descLines = wrapText(descText, regular, DESC_SIZE, DESC_MAX_W)
    const rowH      = Math.max(MIN_ROW_H, descLines.length * LINE_H + ROW_V_PAD * 2)

    if (cursor - rowH < CONTENT_BOTTOM) {
      page.drawLine({ start: { x: MARGIN, y: cursor }, end: { x: RIGHT, y: cursor }, thickness: 0.4, color: rgb(0.80, 0.80, 0.80) })
      addPage(true)
      rowIndex = 0
    }

    const rowBottom  = cursor - rowH
    if (rowIndex % 2 === 1) {
      page.drawRectangle({ x: MARGIN, y: rowBottom, width: CONTENT_W, height: rowH, color: LIGHT_ROW })
    }

    const firstLineY = cursor - ROW_V_PAD - DESC_SIZE + 1
    for (let li = 0; li < descLines.length; li++) {
      drawText(page, descLines[li], MARGIN + 5, firstLineY - li * LINE_H, regular, DESC_SIZE, DARK_TEXT)
    }

    const numY    = firstLineY
    const lineAmt = (item.quantity * item.unitPrice) - (item.discount ?? 0)

    drawRightAlignedText(page, String(item.quantity),       R_QTY - 4,   numY, regular, 8.5, DARK_TEXT)
    drawRightAlignedText(page, formatZAR(item.unitPrice),   R_PRICE - 4, numY, regular, 8.5, DARK_TEXT)
    if (hasDiscounts) {
      const discStr   = (item.discount ?? 0) > 0 ? `- ${formatZAR(item.discount!)}` : '—'
      const discColor = (item.discount ?? 0) > 0 ? GREEN_TEXT : GRAY_TEXT
      drawRightAlignedText(page, discStr, R_DISC - 4, numY, regular, 8.5, discColor)
    }
    drawRightAlignedText(page, formatZAR(lineAmt), RIGHT - 4, numY, regular, 8.5, DARK_TEXT)

    cursor -= rowH
    rowIndex++
  }

  // Bottom rule under last table row
  page.drawLine({ start: { x: MARGIN, y: cursor }, end: { x: RIGHT, y: cursor }, thickness: 0.4, color: rgb(0.80, 0.80, 0.80) })
  cursor -= 16

  // ── 5. TOTALS — move to new page if they won't fit ────────────────────────
  if (cursor - TOTALS_H < CONTENT_BOTTOM) {
    addPage(false)
  }

  const TX = W - MARGIN - 210

  if (hasDiscounts && totalDiscount > 0) {
    drawText(page, 'Total Savings', TX, cursor, regular, 8.5, GRAY_TEXT)
    drawRightAlignedText(page, `- ${formatZAR(totalDiscount)}`, RIGHT, cursor, regular, 8.5, GREEN_TEXT)
    cursor -= 14
  }

  for (const [label, value] of [
    ['Subtotal',                          formatZAR(data.subtotal)],
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

  // ── 6. PAYMENT INSTRUCTIONS ───────────────────────────────────────────────
  const bankBlockH = 14 + bankRows.length * 12

  if (cursor - bankBlockH >= CONTENT_BOTTOM) {
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

  // ── 7. NOTES ──────────────────────────────────────────────────────────────
  if (noteLines.length > 0 && cursor - 30 >= CONTENT_BOTTOM) {
    cursor -= 10
    drawText(page, 'NOTES', MARGIN, cursor, bold, 7.5, GRAY_TEXT)
    cursor -= 12
    for (const noteLine of noteLines) {
      if (cursor < CONTENT_BOTTOM) break
      drawText(page, noteLine, MARGIN, cursor, regular, 7.5, GRAY_TEXT)
      cursor -= 11
    }
  }

  // ── 8. PAGE NUMBERS — added last so total is known ────────────────────────
  const totalPages = allPages.length
  const pageNumY   = letterhead ? 152 : (FY + 2)

  for (let pi = 0; pi < allPages.length; pi++) {
    drawRightAlignedText(
      allPages[pi],
      `Page ${pi + 1} of ${totalPages}`,
      RIGHT, pageNumY,
      regular, 7, GRAY_TEXT,
    )
  }

  return pdfDoc.save()
}
