import { google } from 'googleapis'

const SHEET_ID = process.env.SHOSHOLOZA_SHEET_ID!
const TAB_2026 = 'COT Debt review list 2026'
const TAB_2025 = 'COT Debt review list 2025'
const TAB_QUALIFY = 'Zenowethu list (QUALIFY OR NOT)'

// Row 3 is the header row; data starts at row 4
const DATA_START_ROW = 4

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

export async function getShosholozaClients(tab: string = TAB_2026): Promise<ShoshololozaClient[]> {
  const auth = getAuthClient()
  const sheets = google.sheets({ version: 'v4', auth })

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${tab}'!A${DATA_START_ROW}:Q`,
  })

  const rows = response.data.values ?? []

  return rows
    .map((row, index) => rowToClient(row as string[], DATA_START_ROW + index))
    .filter(client => client.idNumber.length > 0)
}

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
