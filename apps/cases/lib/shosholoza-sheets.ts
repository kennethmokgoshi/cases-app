import { google } from 'googleapis'

const SHEET_ID = process.env.SHOSHOLOZA_SHEET_ID!
const TAB_2026 = 'COT Debt review list 2026'
const TAB_2025 = 'COT Debt review list 2025'
const TAB_QUALIFY = 'Zenowethu list (QUALIFY OR NOT)'

// Row 3 is the header row; data starts at row 4
const DATA_START_ROW = 4

// Tab name → Google Sheet GID (needed for CSV export URL)
const TAB_GIDS: Record<string, string> = {
  [TAB_2026]: '333864337',
  [TAB_2025]: '0', // fallback — will use sheet name param instead
}

export interface ShoshololozaClient {
  rowIndex: number       // actual sheet row number (for updates)
  fileNr: string         // Column A — Shosholoza case ref
  initials: string       // Column B
  surname: string        // Column C
  idNumber: string       // Column D — primary matching key
  personPay: string      // Column E — PDA reference
  cellNumber: string     // Column F
  debtReview: string     // Column G — status
  processNotes: string   // Column H — how far in process
  form17W: string        // Column I
  ncrdc: string          // Column J
  fees: string           // Column K
  payment: string        // Column L
  date: string           // Column M
  poa: string            // Column N
  process: string        // Column O
  removed: string        // Column P
  paymentNotes: string   // Column Q
}

export interface ShosholozaUpdatePayload {
  rowIndex: number
  form17W?: string
  processNotes?: string
  poa?: string
  process?: string
  removed?: string
  paymentNotes?: string
}

// Column letters for fields we write back to
const WRITE_COLUMNS: Record<string, string> = {
  form17W: 'I',
  processNotes: 'H',
  poa: 'N',
  process: 'O',
  removed: 'P',
  paymentNotes: 'Q',
}

function getAuthClient() {
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL

  if (!privateKey || !clientEmail) {
    throw new Error('Missing Google service account credentials in environment variables')
  }

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function parseCSV(csv: string): string[][] {
  const rows: string[][] = []
  const lines = csv.split('\n')
  for (const line of lines) {
    if (!line.trim()) continue
    // Handle quoted fields with commas inside
    const fields: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    fields.push(current.trim())
    rows.push(fields)
  }
  return rows
}

function rowToClient(row: string[], rowIndex: number): ShoshololozaClient {
  return {
    rowIndex,
    fileNr: row[0] ?? '',
    initials: row[1] ?? '',
    surname: row[2] ?? '',
    idNumber: (row[3] ?? '').toString().trim(),
    personPay: row[4] ?? '',
    cellNumber: row[5] ?? '',
    debtReview: row[6] ?? '',
    processNotes: row[7] ?? '',
    form17W: row[8] ?? '',
    ncrdc: row[9] ?? '',
    fees: row[10] ?? '',
    payment: row[11] ?? '',
    date: row[12] ?? '',
    poa: row[13] ?? '',
    process: row[14] ?? '',
    removed: row[15] ?? '',
    paymentNotes: row[16] ?? '',
  }
}

// READ via CSV export URL — works with .xlsx files hosted on Google Sheets
export async function getShosholozaClients(tab: string = TAB_2026): Promise<ShoshololozaClient[]> {
  const gid = TAB_GIDS[tab]
  const url = gid
    ? `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`
    : `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`

  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`CSV fetch failed: ${response.status} ${response.statusText}`)

  const csv = await response.text()
  const allRows = parseCSV(csv)

  // Skip header rows (rows 1-3 in sheet = rows 0-2 in array); data starts at index 3
  const dataRows = allRows.slice(DATA_START_ROW - 1)

  return dataRows
    .map((row, index) => rowToClient(row, DATA_START_ROW + index))
    .filter(client => client.idNumber.length > 0)
}

// WRITE via Sheets API — requires the file to be native Google Sheets format
// If the file is .xlsx, the user must first convert it: File → Save as Google Sheets
export async function updateShosholozaRow(
  payload: ShosholozaUpdatePayload,
  tab: string = TAB_2026
): Promise<void> {
  const auth = getAuthClient()
  const sheets = google.sheets({ version: 'v4', auth })

  const updates: { range: string; values: string[][] }[] = []

  for (const [field, col] of Object.entries(WRITE_COLUMNS)) {
    const value = payload[field as keyof ShosholozaUpdatePayload]
    if (value !== undefined) {
      updates.push({
        range: `'${tab}'!${col}${payload.rowIndex}`,
        values: [[value as string]],
      })
    }
  }

  if (updates.length === 0) return

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: updates,
    },
  })
}

export async function findClientByIdNumber(
  idNumber: string,
  tab: string = TAB_2026
): Promise<ShoshololozaClient | null> {
  const clients = await getShosholozaClients(tab)
  return clients.find(c => c.idNumber === idNumber.trim()) ?? null
}

export { TAB_2025, TAB_2026, TAB_QUALIFY }
