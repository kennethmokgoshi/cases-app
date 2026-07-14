import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { executeNextStep } from '@zenowethu/plan-engine';

const logger = createLogger('ai-plan-step-resume');

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

    // WAITING_FOR_USER = paused at a breakpoint; FAILED = staff retrying after an error
    const isRetry = step.status === 'FAILED';
    if (step.status !== 'WAITING_FOR_USER' && !isRetry) {
      return NextResponse.json(
        { error: `Step cannot be resumed. Current status: ${step.status}` },
        { status: 409 },
      );
    }

    const plan = await prisma.casePlan.findUnique({ where: { id: planId } });
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Reset step to PENDING and clear breakpoint flags and any previous failure
    await prisma.casePlanStep.update({
      where: { id: stepId },
      data: {
        status: 'PENDING',
        breakpointBefore: false,
        pausedAt: null,
        error: null,
        executedAt: null,
        completedAt: null,
      },
    });

    // Resume the plan
    await prisma.casePlan.update({ where: { id: planId }, data: { status: 'IN_PROGRESS' } });

    await prisma.caseComment.create({
      data: {
        caseId: plan.caseId,
        userId: session.user.id,
        content: isRetry
          ? `Failed Step ${step.stepNumber} retried: "${step.title}" (previous error: ${step.error || 'unknown'})`
          : `Plan resumed at Step ${step.stepNumber}: "${step.title}"`,
        type: 'AI_PLAN',
        isInternal: true,
        activityType: 'PLAN_RESUMED',
      },
    });

    await executeNextStep(planId, session.user.id);

    const updated = await prisma.casePlan.findUnique({
      where: { id: planId },
      include: { steps: { orderBy: { stepNumber: 'asc' } } },
    });

    return NextResponse.json({ plan: updated });
  } catch (error) {
    logger.error({ err: error }, 'Failed to resume plan step');
    return NextResponse.json({ error: 'Failed to resume step' }, { status: 500 });
  }
}
