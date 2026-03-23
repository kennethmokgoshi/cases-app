import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { startPlanExecution } from '@zenowethu/plan-engine';

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

    await startPlanExecution(planId, session.user.id);

    await prisma.caseComment.create({
      data: {
        caseId: plan.caseId,
        userId: session.user.id,
        content: `AI Plan execution started by ${session.user.firstName || session.user.email}.`,
        type: 'AI_PLAN',
        isInternal: true,
        activityType: 'AI_PLAN_STARTED',
      },
    });

    const updated = await prisma.casePlan.findUnique({
      where: { id: planId },
      include: { steps: { orderBy: { stepNumber: 'asc' } } },
    });

    return NextResponse.json({ plan: updated });
  } catch (error) {
    console.error('[AI Plan Start]', error);
    return NextResponse.json({ error: 'Failed to start plan execution' }, { status: 500 });
  }
}
