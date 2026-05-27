import { NextResponse } from 'next/server'
import { prisma } from '@zenowethu/database'
import { auth } from '@zenowethu/shared-lib'
import { logger } from '@zenowethu/shared-lib/src/logger'
import { dccpService } from '@zenowethu/shared-lib/src/integrations/dccp'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const policy = await prisma.dCCPPolicy.findUnique({
      where: { id: params.id },
      include: {
        creditAccounts: true,
        funeralDependants: true,
      },
    })

    if (!policy) {
      return NextResponse.json({ error: 'Policy not found' }, { status: 404 })
    }

    if (policy.status !== 'DRAFT') {
      return NextResponse.json({ error: `Cannot submit policy with status: ${policy.status}` }, { status: 400 })
    }

    // Map DB record to DCCPPolicyInput
    let input: any = {
      policyType: policy.policyType,
      client: {
        firstName: policy.clientFirstName,
        lastName: policy.clientLastName,
        idNumber: policy.clientIdNumber,
        phone: policy.clientPhone,
      },
      banking: {
        bankName: policy.bankName,
        accountNumber: policy.accountNumber,
      },
    }

    if (policy.policyType === 'CLI') {
      input.creditAccounts = policy.creditAccounts.map(acc => ({
        creditProvider: acc.creditProvider,
        accountNumber: acc.accountNumber,
        outstandingBalance: Number(acc.outstandingBalance),
      }))
    } else if (policy.policyType === 'AIP') {
      input.monthlyBenefit = policy.aipCoverAmount || 5000
      input.employerName = policy.employerName || 'Unknown'
    } else if (policy.policyType === 'FUNERAL') {
      input.funeralCoverType = policy.funeralCoverType || 'INDIVIDUAL'
      input.coverAmount = policy.funeralCoverAmount || 10000
      if (input.funeralCoverType === 'FAMILY') {
        input.dependants = policy.funeralDependants.map(dep => ({
          firstName: dep.firstName,
          lastName: dep.lastName,
        }))
      }
    }

    const result = await dccpService.capturePolicy(input, session.user.id)

    if (result.success && result.policyNumber) {
      await prisma.dCCPPolicy.update({
        where: { id: params.id },
        data: {
          status: 'SUBMITTED',
          policyNumber: result.policyNumber,
        },
      })
      
      logger.info(`[DCCP] Policy ${params.id} submitted successfully. Policy Number: ${result.policyNumber}`)
      return NextResponse.json({ success: true, policyNumber: result.policyNumber })
    } else {
      logger.error(`[DCCP] Policy ${params.id} submission failed.`, { error: result.errorMessage })
      return NextResponse.json({ error: result.errorMessage || 'Submission failed' }, { status: 422 })
    }
  } catch (error) {
    logger.error(`[DCCP] POST /api/dccp/policies/[id]/submit error`, error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
