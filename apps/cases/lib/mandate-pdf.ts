import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib'
import fs from 'fs'
import path from 'path'

// ---- Types ----

export interface MandateData {
  invoiceNumber: string; // Used as reference
  client: {
    firstName?: string;
    lastName?: string;
    idNumber?: string;
    phone?: string;
    address?: string;
  };
  jointClient?: {
    firstName?: string;
    lastName?: string;
    idNumber?: string;
  };
  bankDetails?: {
    bankName: string;
    accountHolder: string;
    accountNumber: string;
    branchCode: string;
    accountType: string;
  };
  paymentDetails?: {
    contractAmount: string;
    instalmentAmount: string;
    numInstalments: string;
    frequency: string;
    firstDate: string;
    lastDate: string;
  };
  salesPerson?: string;
  issuedAt: Date;
}

// ---- Helpers ----

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = rgb(0, 0, 0)
) {
  page.drawText(text, { x, y, font, size, color })
}

function drawLine(page: PDFPage, x1: number, y1: number, x2: number, y2: number, thickness = 0.5, color = rgb(0.8, 0.8, 0.8)) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color })
}

// ---- Main Generator ----

export async function generateMandatePdf(data: MandateData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595, 842]) // A4
  const { width: W, height: H } = page.getSize()

  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  
  // Colors from branding
  const PRIMARY_NAVY = rgb(0.05, 0.1, 0.25)
  const DARK_TEXT = rgb(0.1, 0.1, 0.1)
  const GRAY_TEXT = rgb(0.4, 0.4, 0.4)

  // 1. EMBED LETTERHEAD
  try {
    const letterheadPath = path.join(process.cwd(), '../../letterhead/Letter head Clean.pdf')
    if (fs.existsSync(letterheadPath)) {
      const letterheadBytes = fs.readFileSync(letterheadPath)
      const letterheadDoc = await PDFDocument.load(letterheadBytes)
      const [embeddedPage] = await pdfDoc.embedPdf(letterheadDoc)
      page.drawPage(embeddedPage, { x: 0, y: 0, width: W, height: H })
    }
  } catch (e) {
    console.error('Mandate letterhead load failed:', e)
  }

  let cursor = H - 130 // Start higher up
  const MARGIN = 50
  const RIGHT = W - MARGIN

  // TITLE
  const title = 'AUTHORITY AND MANDATE FOR PAYMENT INSTRUCTIONS'
  const titleW = bold.widthOfTextAtSize(title, 12)
  drawText(page, title, (W - titleW) / 2, cursor, bold, 12, PRIMARY_NAVY)
  drawLine(page, (W - titleW) / 2, cursor - 2, (W + titleW) / 2, cursor - 2, 1, PRIMARY_NAVY)
  
  cursor -= 25

  // Helper for drawing tables
  const drawTableRow = (label: string, value: string, y: number) => {
    const rowH = 16 // Slightly tighter rows
    // Outer box
    page.drawRectangle({ x: MARGIN, y: y - 12, width: W - (MARGIN * 2), height: rowH, borderWidth: 0.5, borderColor: rgb(0,0,0) })
    // Divider
    drawLine(page, MARGIN + 150, y - 12, MARGIN + 150, y + 4, 0.5, rgb(0,0,0))
    // Text
    drawText(page, label, MARGIN + 5, y - 5, regular, 9, DARK_TEXT)
    drawText(page, value || '', MARGIN + 155, y - 5, regular, 9, DARK_TEXT)
    return y - rowH
  }

  // A. AUTHORITY
  drawText(page, 'A.  AUTHORITY', MARGIN, cursor, bold, 11, DARK_TEXT)
  drawLine(page, MARGIN, cursor - 2, MARGIN + 85, cursor - 2, 1, DARK_TEXT)
  cursor -= 15

  const primaryName = `${data.client.firstName || ''} ${data.client.lastName || ''}`.trim()
  const jointName = data.jointClient ? `${data.jointClient.firstName || ''} ${data.jointClient.lastName || ''}`.trim() : ''
  const displayName = jointName ? `${primaryName} & ${jointName}` : primaryName

  cursor = drawTableRow('Customer name', displayName, cursor)
  
  const displayId = data.jointClient 
    ? `${data.client.idNumber || ''} / ${data.jointClient.idNumber || ''}`
    : (data.client.idNumber || '')
    
  cursor = drawTableRow('Identity number', displayId, cursor)
  cursor = drawTableRow('Contact numbers', data.client.phone || '', cursor)
  const addrParts = (data.client.address || '').split('\n')
  cursor = drawTableRow('Address', addrParts[0] || '', cursor)
  cursor = drawTableRow('', addrParts[1] || '', cursor)
  cursor = drawTableRow('', addrParts[2] || '', cursor)

  cursor -= 15 // Reduced gap

  // B. BANK ACCOUNT DETAILS
  drawText(page, 'B.  BANK ACCOUNT DETAILS', MARGIN, cursor, bold, 11, DARK_TEXT)
  drawLine(page, MARGIN, cursor - 2, MARGIN + 145, cursor - 2, 1, DARK_TEXT)
  cursor -= 15

  cursor = drawTableRow('Bank name', data.bankDetails?.bankName || '', cursor)
  cursor = drawTableRow('Account holder name', data.bankDetails?.accountHolder || '', cursor)
  cursor = drawTableRow('Branch code', data.bankDetails?.branchCode || '', cursor)
  cursor = drawTableRow('Account number', data.bankDetails?.accountNumber || '', cursor)
  
  // Account Type Checkboxes
  const typeY = cursor - 12
  page.drawRectangle({ x: MARGIN, y: typeY, width: W - (MARGIN * 2), height: 16, borderWidth: 0.5, borderColor: rgb(0,0,0) })
  drawLine(page, MARGIN + 150, typeY, MARGIN + 150, typeY + 16, 0.5, rgb(0,0,0))
  drawText(page, 'Type of account:', MARGIN + 5, cursor - 5, regular, 9, DARK_TEXT)
  
  const types = ['Cheque', 'Savings', 'Transmission']
  let typeX = MARGIN + 155
  types.forEach(t => {
    const isSelected = data.bankDetails?.accountType?.toLowerCase() === t.toLowerCase()
    page.drawRectangle({ x: typeX, y: typeY + 3, width: 10, height: 10, borderWidth: 0.5, borderColor: rgb(0,0,0) })
    if (isSelected) {
       drawText(page, 'X', typeX + 2, typeY + 5, bold, 8, PRIMARY_NAVY)
    }
    drawText(page, t, typeX + 15, cursor - 5, regular, 9, DARK_TEXT)
    typeX += 80
  })
  cursor -= 16
  cursor -= 15 // Reduced gap

  // C. PAYMENT DETAILS
  drawText(page, 'C.  PAYMENT DETAILS', MARGIN, cursor, bold, 11, DARK_TEXT)
  drawLine(page, MARGIN, cursor - 2, MARGIN + 115, cursor - 2, 1, DARK_TEXT)
  cursor -= 15

  cursor = drawTableRow('Contract Amount', data.paymentDetails?.contractAmount || '', cursor)
  cursor = drawTableRow('Instalment amount', data.paymentDetails?.instalmentAmount || '', cursor)
  cursor = drawTableRow('Number of instalments', data.paymentDetails?.numInstalments || '', cursor)
  cursor = drawTableRow('Frequency of instalments', data.paymentDetails?.frequency || '', cursor)
  cursor = drawTableRow('Date of First Instalment', data.paymentDetails?.firstDate || '', cursor)
  cursor = drawTableRow('Date of Last Installment', data.paymentDetails?.lastDate || '', cursor)

  cursor -= 15 // Reduced gap

  // D. BENEFICIARY DETAILS
  drawText(page, 'D.  BENEFICIARY DETAILS', MARGIN, cursor, bold, 11, DARK_TEXT)
  drawLine(page, MARGIN, cursor - 2, MARGIN + 135, cursor - 2, 1, DARK_TEXT)
  cursor -= 15

  cursor = drawTableRow('To (Company Name)', 'Zenowethu Debt Management', cursor)
  cursor = drawTableRow('Company Address', 'Suite 2, Second Floor', cursor)
  cursor = drawTableRow('', 'Old Mutual Building', cursor)
  cursor = drawTableRow('', '17 Central Road', cursor)
  cursor = drawTableRow('', 'Mabopane', cursor)
  cursor = drawTableRow('Postal Code', '0190', cursor)
  cursor = drawTableRow('Contact Details', '012 023 2415 / 081 310 9585', cursor)

  cursor -= 20

  // E. REFERENCE NUMBER & FOOTER (Second Page)
  const page2 = pdfDoc.addPage([595, 842])
  
  // Apply letterhead to page 2 too
  try {
    const letterheadPath = path.join(process.cwd(), '../../letterhead/Letter head Clean.pdf')
    if (fs.existsSync(letterheadPath)) {
      const letterheadBytes = fs.readFileSync(letterheadPath)
      const letterheadDoc = await PDFDocument.load(letterheadBytes)
      const [embeddedPage] = await pdfDoc.embedPdf(letterheadDoc)
      page2.drawPage(embeddedPage, { x: 0, y: 0, width: W, height: H })
    }
  } catch (e) {
    console.error('Mandate page 2 letterhead load failed:', e)
  }

  let cursor2 = H - 150
  drawText(page2, 'FOR OFFICE USE', MARGIN, cursor2 + 20, bold, 10, DARK_TEXT)
  drawText(page2, 'E.  REFERENCE NUMBER', MARGIN, cursor2, bold, 11, DARK_TEXT)
  drawLine(page2, MARGIN, cursor2 - 2, MARGIN + 125, cursor2 - 2, 1, DARK_TEXT)
  cursor2 -= 15

  // 1. OFFICE BOX
  const officeBoxH = 100
  page2.drawRectangle({ 
    x: MARGIN - 10, 
    y: cursor2 - officeBoxH + 15, 
    width: W - (MARGIN * 2) + 20, 
    height: officeBoxH, 
    borderWidth: 1, 
    borderColor: rgb(0,0,0) 
  })
  
  let fCursor = cursor2 - 10
  drawText(page2, `Reference number: ${data.invoiceNumber}`, MARGIN + 10, fCursor, regular, 9, DARK_TEXT)
  fCursor -= 25
  
  // Helper for aligned fields in Section E
  const drawField = (p: any, label: string, value: string, y: number) => {
    drawText(p, label, MARGIN + 10, y, bold, 9, DARK_TEXT)
    drawText(p, ':', MARGIN + 115, y, regular, 9, DARK_TEXT)
    drawText(p, value || '___________________________________________________', MARGIN + 125, y, regular, 9, DARK_TEXT)
    return y - 22
  }

  fCursor = drawField(page2, 'Sales person name', data.salesPerson || '', fCursor)
  fCursor = drawField(page2, 'Sales person signature', '', fCursor)
  
  const today = new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')
  fCursor = drawField(page2, 'Date', today, fCursor)

  // 2. CUSTOMER BOX
  cursor2 -= officeBoxH + 40
  drawText(page2, 'CUSTOMER ACCEPTANCE', MARGIN, cursor2 + 20, bold, 11, DARK_TEXT)
  drawLine(page2, MARGIN, cursor2 + 18, MARGIN + 125, cursor2 + 18, 1, DARK_TEXT)

  const customerBoxH = 130
  page2.drawRectangle({ 
    x: MARGIN - 10, 
    y: cursor2 - customerBoxH + 15, 
    width: W - (MARGIN * 2) + 20, 
    height: customerBoxH, 
    borderWidth: 1, 
    borderColor: rgb(0,0,0) 
  })

  fCursor = cursor2 - 10
  // Acknowledgment belongs here
  drawText(page2, 'I hereby acknowledge the content of this agreement and will conduct my mandate with my client', MARGIN + 10, fCursor, regular, 9, DARK_TEXT)
  fCursor -= 12
  drawText(page2, 'accordingly as stipulated on the agreement.', MARGIN + 10, fCursor, regular, 9, DARK_TEXT)
  fCursor -= 25

  fCursor = drawField(page2, 'Customer name', displayName, fCursor)
  fCursor = drawField(page2, 'Customer signature', '', fCursor)
  fCursor = drawField(page2, 'Date', today, fCursor)

  return pdfDoc.save()
}
