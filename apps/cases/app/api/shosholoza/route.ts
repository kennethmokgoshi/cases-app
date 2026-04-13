import { NextResponse } from 'next/server'
import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { z } from 'zod'
import {
  getShosholozaClients,
  findClientByIdNumber,
  updateShosholozaRow,
  TAB_2025,
  TAB_2026,
  type ShoshololozaClient,
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

export interface ShosholozaClientWithMatch extends ShoshololozaClient {
  zenowethuCase: {
    id: string
    fileNumber: string
    status: string
    clientId: string
  } | null
}

// GET /api/shosholoza?tab=...&idNumber=...&match=true
export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const tab = searchParams.get('tab') ?? TAB_2026
    const idNumber = searchParams.get('idNumber')
    const withMatch = searchParams.get('match') === 'true'

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

    if (!withMatch) {
      return NextResponse.json({ clients, total: clients.length })
    }

    // Match against Zenowethu cases by ID number
    const idNumbers = clients.map(c => c.idNumber).filter(Boolean)

    const matchedCases = await prisma.case.findMany({
      where: {
        client: {
          idNumber: { in: idNumbers },
        },
      },
      select: {
        id: true,
        fileNumber: true,
        status: true,
        client: {
          select: { id: true, idNumber: true },
        },
      },
    })

    // Build a lookup map: idNumber → case
    const caseByIdNumber = new Map(
      matchedCases.map(c => [c.client.idNumber ?? '', c])
    )

    const clientsWithMatch: ShosholozaClientWithMatch[] = clients.map(client => ({
      ...client,
      zenowethuCase: (() => {
        const matched = caseByIdNumber.get(client.idNumber)
        if (!matched) return null
        return {
          id: matched.id,
          fileNumber: matched.fileNumber,
          status: matched.status,
          clientId: matched.client.id,
        }
      })(),
    }))

    return NextResponse.json({
      clients: clientsWithMatch,
      total: clientsWithMatch.length,
      matched: clientsWithMatch.filter(c => c.zenowethuCase !== null).length,
      unmatched: clientsWithMatch.filter(c => c.zenowethuCase === null).length,
    })
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
