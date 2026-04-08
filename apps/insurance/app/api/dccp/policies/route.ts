import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@zenowethu/database'
import { auth } from '@zenowethu/shared-lib'
import { logger } from '@zenowethu/shared-lib/src/logger'

// ─── Validation schemas ───────────────────────────────────────────────────────

const CreditAccountSchema = z.object({
  creditProvider: z.string().min(1),
  accountType: z.string().min(1),
  accountNumber: z.string().nullable().optional(),
  outstandingBalance: z.number().min(0),
  currentPremium: z.number().min(0),
  newPremium: z.number().positive(),
  saving: z.number(),
})

const DependantSchema = z.object({
  relationship: z.enum(['HUSBAND', 'WIFE', 'CHILD_14_21', 'CHILD_7_13', 'CHILD_0_6', 'STILLBORN']),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  idNumber: z.string().nullable().optional(),
  coverAmount: z.number().int().positive(),
})

const CreatePolicySchema = z.object({
  policyType: z.enum(['CLI', 'AIP', 'FUNERAL']),
  clientFirstName: z.string().min(1),
  clientLastName: z.string().min(1),
  clientIdNumber: z.string().length(13),
  clientDob: z.string().min(1),
  clientEmail: z.string().email().nullable().optional(),
  clientPhone: z.string().min(1),
  clientAddress: z.string().min(1),
  bankName: z.string().min(1),
  accountNumber: z.string().min(1),
  accountType: z.enum(['CHEQUE', 'SAVINGS']),
  debitOrderDate: z.number().int().min(1).max(31),
  inceptionDate: z.string().min(1),
  retailPremium: z.number().positive(),
  referralFee: z.number().positive(),
  hasPreviousPolicy: z.boolean().optional(),
  previousInsurerName: z.string().nullable().optional(),
  previousPolicyNumber: z.string().nullable().optional(),
  previousPolicySchedule: z.boolean().optional(),
  // CLI
  creditAccounts: z.array(CreditAccountSchema).optional(),
  // AIP
  aipCoverAmount: z.number().int().optional(),
  employerName: z.string().optional(),
  employedSince: z.string().optional(),
  // Funeral
  funeralCoverType: z.enum(['INDIVIDUAL', 'FAMILY']).optional(),
  funeralCoverAmount: z.number().int().optional(),
  beneficiaryName: z.string().optional(),
  beneficiaryRelationship: z.string().optional(),
  dependants: z.array(DependantSchema).optional(),
  // Optional case link
  caseId: z.string().optional(),
  clientId: z.string().optional(),
})

// ─── GET /api/dccp/policies ───────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const take = Math.min(parseInt(searchParams.get('take') ?? '20'), 100)
    const skip = parseInt(searchParams.get('skip') ?? '0')
    const status = searchParams.get('status') ?? undefined
    const policyType = searchParams.get('policyType') ?? undefined

    const where: any = {
      ...(status ? { status } : {}),
      ...(policyType ? { policyType } : {}),
    }

    const [policies, total] = await Promise.all([
      prisma.dCCPPolicy.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          policyType: true,
          status: true,
          clientFirstName: true,
          clientLastName: true,
          clientIdNumber: true,
          retailPremium: true,
          referralFee: true,
          policyNumber: true,
          inceptionDate: true,
          createdAt: true,
        },
      }),
      prisma.dCCPPolicy.count({ where }),
    ])

    // Stats aggregate
    const stats = await prisma.dCCPPolicy.groupBy({
      by: ['status', 'policyType'],
      _count: { id: true },
    })

    const counts = {
      totalPolicies: total,
      draftPolicies: 0,
      submittedPolicies: 0,
      activePolicies: 0,
      cliPolicies: 0,
      aipPolicies: 0,
      funeralPolicies: 0,
    } as Record<string, number>

    for (const row of stats) {
      const cnt = row._count.id
      if (row.status === 'DRAFT') counts.draftPolicies += cnt
      if (row.status === 'SUBMITTED') counts.submittedPolicies += cnt
      if (row.status === 'ACTIVE') counts.activePolicies += cnt
      if (row.policyType === 'CLI') counts.cliPolicies += cnt
      if (row.policyType === 'AIP') counts.aipPolicies += cnt
      if (row.policyType === 'FUNERAL') counts.funeralPolicies += cnt
    }

    return NextResponse.json({ policies, stats: counts, total, take, skip })
  } catch (error) {
    logger.error('[DCCP] GET /api/dccp/policies error', error)
    return NextResponse.json({ error: 'Failed to load policies' }, { status: 500 })
  }
}

// ─── POST /api/dccp/policies ──────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = CreatePolicySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const d = parsed.data

    // Create policy + related records in a transaction
    const policy = await prisma.$transaction(async (tx) => {
      const created = await tx.dCCPPolicy.create({
        data: {
          id: crypto.randomUUID(),
          policyType: d.policyType,
          status: 'DRAFT',
          clientFirstName: d.clientFirstName,
          clientLastName: d.clientLastName,
          clientIdNumber: d.clientIdNumber,
          clientDob: new Date(d.clientDob),
          clientEmail: d.clientEmail ?? null,
          clientPhone: d.clientPhone,
          clientAddress: d.clientAddress,
          bankName: d.bankName,
          accountNumber: d.accountNumber,
          accountType: d.accountType,
          debitOrderDate: d.debitOrderDate,
          inceptionDate: new Date(d.inceptionDate),
          retailPremium: d.retailPremium,
          referralFee: d.referralFee,
          previousInsurerName: d.hasPreviousPolicy ? (d.previousInsurerName ?? null) : null,
          previousPolicyNumber: d.hasPreviousPolicy ? (d.previousPolicyNumber ?? null) : null,
          previousPolicySchedule: d.hasPreviousPolicy ? (d.previousPolicySchedule ?? false) : false,
          employerName: d.employerName ?? null,
          employedSince: d.employedSince ? new Date(d.employedSince) : null,
          aipCoverAmount: d.aipCoverAmount ?? null,
          funeralCoverType: d.funeralCoverType ?? null,
          funeralCoverAmount: d.funeralCoverAmount ?? null,
          caseId: d.caseId ?? null,
          clientId: d.clientId ?? null,
        },
      })

      // CLI: create credit account records
      if (d.policyType === 'CLI' && d.creditAccounts?.length) {
        await tx.dCCPCreditAccount.createMany({
          data: d.creditAccounts.map(a => ({
            id: crypto.randomUUID(),
            policyId: created.id,
            creditProvider: a.creditProvider,
            accountNumber: a.accountNumber ?? null,
            accountType: a.accountType,
            outstandingBalance: a.outstandingBalance,
            currentPremium: a.currentPremium,
            newPremium: a.newPremium,
            saving: a.saving,
          })),
        })
      }

      // FUNERAL FAMILY: create dependant records
      if (d.policyType === 'FUNERAL' && d.funeralCoverType === 'FAMILY' && d.dependants?.length) {
        await tx.dCCPFuneralDependant.createMany({
          data: d.dependants.map(dep => ({
            id: crypto.randomUUID(),
            policyId: created.id,
            relationship: dep.relationship,
            firstName: dep.firstName,
            lastName: dep.lastName,
            idNumber: dep.idNumber ?? null,
            coverAmount: dep.coverAmount,
          })),
        })
      }

      return created
    })

    logger.info('[DCCP] Policy created', { id: policy.id, type: policy.policyType, client: `${d.clientFirstName} ${d.clientLastName}` })

    return NextResponse.json({ id: policy.id, status: policy.status }, { status: 201 })
  } catch (error) {
    logger.error('[DCCP] POST /api/dccp/policies error', error)
    return NextResponse.json({ error: 'Failed to create policy' }, { status: 500 })
  }
}
