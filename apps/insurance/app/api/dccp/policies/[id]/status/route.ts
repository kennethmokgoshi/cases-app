import { NextResponse } from 'next/server'
import { prisma } from '@zenowethu/database'
import { auth } from '@zenowethu/shared-lib'
import { logger } from '@zenowethu/shared-lib/src/logger'
import { dccpService } from '@zenowethu/shared-lib/src/integrations/dccp'

export async function GET(
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
      select: { id: true, policyNumber: true, status: true },
    })

    if (!policy) {
      return NextResponse.json({ error: 'Policy not found' }, { status: 404 })
    }

    if (!policy.policyNumber) {
      return NextResponse.json({ error: 'Policy has no policy number assigned' }, { status: 400 })
    }

    const result = await dccpService.getPolicyStatus(policy.policyNumber, session.user.id)

    if (result.status && result.status !== policy.status) {
      await prisma.dCCPPolicy.update({
        where: { id: params.id },
        data: { status: result.status },
      })
      logger.info(`[DCCP] Policy ${params.id} status synced: ${policy.status} -> ${result.status}`)
    }

    return NextResponse.json({ status: result.status, policyNumber: policy.policyNumber })
  } catch (error) {
    logger.error(`[DCCP] GET /api/dccp/policies/[id]/status error`, error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
