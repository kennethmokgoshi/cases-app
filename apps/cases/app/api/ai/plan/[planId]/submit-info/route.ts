import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { z } from 'zod';
import { evaluateNewInfo } from '@zenowethu/plan-engine';

const schema = z.object({
  description: z.string().min(10, 'Description must be at least 10 characters'),
});

export async function POST(
  request: NextRequest,
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

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400 });
    }

    const { description } = parsed.data;

    const result = await evaluateNewInfo(planId, description);

    await prisma.caseComment.create({
      data: {
        caseId: plan.caseId,
        userId: session.user.id,
        content: `[AI Plan] New information submitted: "${description}"\nImpact: ${result.changeType} — ${result.notificationMessage}`,
        type: 'AI_PLAN',
        isInternal: true,
        activityType: 'PLAN_INFO_SUBMITTED',
      },
    });

    return NextResponse.json({ result });
  } catch (error) {
    console.error('[AI Plan Submit Info]', error);
    return NextResponse.json({ error: 'Failed to evaluate new information' }, { status: 500 });
  }
}
