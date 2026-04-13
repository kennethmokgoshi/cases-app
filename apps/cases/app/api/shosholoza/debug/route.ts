import { NextResponse } from 'next/server'
import { auth } from '@zenowethu/shared-lib'

// GET /api/shosholoza/debug — shows exactly what's failing
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const results: Record<string, unknown> = {}

    // Step 1: Check env vars
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
    const sheetId = process.env.SHOSHOLOZA_SHEET_ID

    results.envVars = {
      emailSet: !!email,
      emailValue: email ?? 'MISSING',
      privateKeySet: !!rawKey,
      privateKeyLength: rawKey?.length ?? 0,
      privateKeyStarts: rawKey?.substring(0, 30) ?? 'MISSING',
      sheetIdSet: !!sheetId,
      sheetIdValue: sheetId ?? 'MISSING',
    }

    if (!email || !rawKey || !sheetId) {
      return NextResponse.json({ step: 'env_vars', results, error: 'Missing env vars' })
    }

    // Step 2: Check googleapis import
    try {
      // @ts-ignore
      const { google } = await import('googleapis')
      results.googleapisImport = 'OK'

      // Step 3: Try creating auth client
      try {
        const privateKey = rawKey.replace(/\\n/g, '\n')
        results.privateKeyAfterReplace = {
          length: privateKey.length,
          starts: privateKey.substring(0, 40),
          hasBeginMarker: privateKey.includes('-----BEGIN PRIVATE KEY-----'),
          hasEndMarker: privateKey.includes('-----END PRIVATE KEY-----'),
        }

        const authClient = new google.auth.JWT({
          email,
          key: privateKey,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        })
        results.authClientCreated = 'OK'

        // Step 4: Try fetching the sheet
        try {
          const sheets = google.sheets({ version: 'v4', auth: authClient })
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: `'COT Debt review list 2026'!A3:B5`,
          })
          results.sheetFetch = 'OK'
          results.sampleData = response.data.values
        } catch (sheetErr: any) {
          results.sheetFetch = 'FAILED'
          results.sheetError = sheetErr.message
          results.sheetErrorCode = sheetErr.code
        }
      } catch (authErr: any) {
        results.authClientCreated = 'FAILED'
        results.authError = authErr.message
      }
    } catch (importErr: any) {
      results.googleapisImport = 'FAILED'
      results.importError = importErr.message
    }

    return NextResponse.json(results)
  } catch (e: any) {
    return NextResponse.json({ topLevelError: e.message, stack: e.stack?.substring(0, 500) }, { status: 500 })
  }
}
