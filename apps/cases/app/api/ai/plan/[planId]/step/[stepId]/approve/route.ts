import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { executeNextStep } from '@zenowethu/plan-engine';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ planId: string; stepId: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { planId, stepId } = await params;

    const step = await prisma.casePlanStep.findUnique({ where: { id: stepId } });
    if (!step || step.planId !== planId) {
      return NextResponse.json({ error: 'Step not found' }, { status: 404 });
    }

    if (step.status !== 'WAITING_FOR_USER') {
      return NextResponse.json(
        { error: `Step cannot be approved. Current status: ${step.status}` },
        { status: 409 },
      );
    }

    const plan = await prisma.casePlan.findUnique({ where: { id: planId } });
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Clear the requiresApproval flag and reset to PENDING so executor can run it
    await prisma.casePlanStep.update({
      where: { id: stepId },
      data: { requiresApproval: false, status: 'PENDING' },
    });

    // Ensure plan is IN_PROGRESS
    if (plan.status === 'PAUSED' || plan.status === 'APPROVED') {
      await prisma.casePlan.update({ where: { id: planId }, data: { status: 'IN_PROGRESS' } });
    }

    await prisma.caseComment.create({
      data: {
        caseId: plan.caseId,
        userId: session.user.id,
        content: `Step ${step.stepNumber} approved: "${step.title}"`,
        type: 'AI_PLAN',
        isInternal: true,
        activityType: 'PLAN_STEP_APPROVED',
      },
    });

    await executeNextStep(planId, session.user.id);

    const updated = await prisma.casePlan.findUnique({
      where: { id: planId },
      include: { steps: { orderBy: { stepNumber: 'asc' } } },
    });

    return NextResponse.json({ plan: updated });
  } catch (error) {
    console.error('[AI Plan Step Approve]', error);
    return NextResponse.json({ error: 'Failed to approve step' }, { status: 500 });
  }
}
