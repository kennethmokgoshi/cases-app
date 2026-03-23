import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { planId } = await params;

    const plan = await prisma.casePlan.findUnique({ where: { id: planId } });
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    if (plan.status !== 'AWAITING_APPROVAL') {
      return NextResponse.json(
        { error: `Plan cannot be approved. Current status: ${plan.status}` },
        { status: 409 },
      );
    }

    const updated = await prisma.casePlan.update({
      where: { id: planId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedById: session.user.id,
      },
      include: { steps: { orderBy: { stepNumber: 'asc' } } },
    });

    await prisma.caseComment.create({
      data: {
        caseId: plan.caseId,
        userId: session.user.id,
        content: `AI Plan approved by ${session.user.firstName || session.user.email}. Ready to start execution.`,
        type: 'AI_PLAN',
        isInternal: true,
        activityType: 'AI_PLAN_APPROVED',
      },
    });

    return NextResponse.json({ plan: updated });
  } catch (error) {
    console.error('[AI Plan Approve]', error);
    return NextResponse.json({ error: 'Failed to approve plan' }, { status: 500 });
  }
}
