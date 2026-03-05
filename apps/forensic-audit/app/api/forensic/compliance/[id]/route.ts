import { logger } from '@zenowethu/shared-lib';
import { NextResponse } from 'next/server'
import { auth } from '@zenowethu/shared-lib'
import { prisma } from '@zenowethu/database'
import { z } from 'zod'

const CompliancePatchSchema = z.object({
  status: z.enum(['REVIEWED', 'REQUIRES_ACTION', 'RESOLVED']),
  notes: z.string().optional() })

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = CompliancePatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 })
    }

    const existing = await prisma.forensicAudit.findUnique({
      where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 })
    }

    const updated = await prisma.forensicAudit.update({
      where: { id },
      data: { status: parsed.data.status } })

    // Write audit trail entry
    if (existing.caseId) {
      await prisma.workflowLog.create({
        data: {
          id: crypto.randomUUID(),
          caseId: existing.caseId,
          fromStatus: existing.status,
          toStatus: parsed.data.status,
          action: 'COMPLIANCE_STATUS_CHANGE',
          userId: session.user.id,
          notes: parsed.data.notes
            ? `[COMPLIANCE_UPDATE] ${parsed.data.notes}`
            : `[COMPLIANCE_UPDATE] Status changed to ${parsed.data.status}` } })
    }

    return NextResponse.json(updated)
  } catch (error) {
    logger.error('Error updating compliance status:', error)
    return NextResponse.json({ error: 'Failed to update compliance status' }, { status: 500 })
  }
}
