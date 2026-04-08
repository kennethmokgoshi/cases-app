import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@zenowethu/shared-lib'
import { logger } from '@zenowethu/shared-lib/src/logger'
import { checkDCCPEligibility } from '@zenowethu/shared-lib/src/integrations/dccp-eligibility'

// ─── Validation schema ────────────────────────────────────────────────────────

const EligibilitySchema = z.object({
  policyType: z.enum(['CLI', 'AIP', 'FUNERAL']),
  dob: z.string().min(1, 'Date of birth is required'),
  employmentType: z.enum(['PERMANENT', 'CONTRACT', 'SELF_EMPLOYED', 'DIRECTOR']).optional(),
  hoursPerWeek: z.number().int().min(0).max(168).optional(),
  creditAccountTypes: z.array(z.string()).optional(),
})

// ─── POST /api/dccp/eligibility ───────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = EligibilitySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { policyType, dob, employmentType, hoursPerWeek, creditAccountTypes } = parsed.data

    const result = checkDCCPEligibility({
      policyType,
      dob: new Date(dob),
      employmentType,
      hoursPerWeek,
      creditAccountTypes,
    })

    logger.info('[DCCP] Eligibility check', { policyType, eligible: result.eligible })

    return NextResponse.json(result)
  } catch (error) {
    logger.error('[DCCP] POST /api/dccp/eligibility error', error)
    return NextResponse.json({ error: 'Eligibility check failed' }, { status: 500 })
  }
}
