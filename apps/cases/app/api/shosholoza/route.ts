import { NextResponse } from 'next/server'
import { auth } from '@zenowethu/shared-lib'
import { z } from 'zod'
import {
  getShosholozaClients,
  findClientByIdNumber,
  updateShosholozaRow,
  TAB_2025,
  TAB_2026,
} from '@/lib/shosholoza-sheets'

const ALLOWED_TABS = [TAB_2025, TAB_2026] as const

const UpdateSchema = z.object({
  rowIndex: z.number().int().min(4),
  tab: z.enum([TAB_2025, TAB_2026]).optional().default(TAB_2026),
  form17W: z.string().optional(),
  processNotes: z.string().optional(),
  poa: z.string().optional(),
  process: z.string().optional(),
  removed: z.string().optional(),
  paymentNotes: z.string().optional(),
})

// GET /api/shosholoza?tab=...&idNumber=...
export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const tab = searchParams.get('tab') ?? TAB_2026
    const idNumber = searchParams.get('idNumber')

    if (!ALLOWED_TABS.includes(tab as typeof ALLOWED_TABS[number])) {
      return NextResponse.json({ error: 'Invalid tab' }, { status: 400 })
    }

    if (idNumber) {
      const client = await findClientByIdNumber(idNumber, tab)
      if (!client) {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 })
      }
      return NextResponse.json({ client })
    }

    const clients = await getShosholozaClients(tab)
    return NextResponse.json({ clients, total: clients.length })
  } catch (error) {
    console.error('[API] GET /api/shosholoza error:', error)
    return NextResponse.json({ error: 'Failed to fetch Shosholoza data' }, { status: 500 })
  }
}

// PATCH /api/shosholoza — update fields on a specific row
export async function PATCH(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = UpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 })
    }

    const { tab, ...payload } = parsed.data
    await updateShosholozaRow(payload, tab)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API] PATCH /api/shosholoza error:', error)
    return NextResponse.json({ error: 'Failed to update Shosholoza sheet' }, { status: 500 })
  }
}
