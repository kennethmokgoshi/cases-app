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

    const plan = await prisma.casePlan.findUnique({
      where: { id: planId },
      select: { id: true, caseId: true, status: true, version: true },
    });

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    if (plan.status === 'IN_PROGRESS') {
      return NextResponse.json(
        { error: 'Cannot decline a plan that is currently in progress.' },
        { status: 409 },
      );
    }

    await prisma.casePlan.update({
      where: { id: planId },
      data: { status: 'CANCELLED' },
    });

    await prisma.caseComment.create({
      data: {
        caseId: plan.caseId,
        userId: session.user.id,
        content: `AI Plan v${plan.version} declined — plan cancelled. A new plan can now be generated.`,
        type: 'AI_PLAN',
        isInternal: true,
        activityType: 'AI_PLAN_GENERATED',
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[AI Plan Decline]', error);
    return NextResponse.json({ error: 'Failed to decline plan' }, { status: 500 });
  }
}
