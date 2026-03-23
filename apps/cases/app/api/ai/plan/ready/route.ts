import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { z } from 'zod';

const schema = z.object({
  caseId: z.string().min(1),
  ready: z.boolean(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400 });
    }

    const { caseId, ready } = parsed.data;

    const caseRecord = await prisma.case.findUnique({ where: { id: caseId } });
    if (!caseRecord) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    await prisma.case.update({
      where: { id: caseId },
      data: { planReadyToStart: ready },
    });

    await prisma.caseComment.create({
      data: {
        caseId,
        userId: session.user.id,
        content: ready
          ? 'Staff confirmed: Information sufficient to proceed with AI Plan generation.'
          : 'Staff un-confirmed: AI Plan readiness flag cleared.',
        type: 'AI_PLAN',
        isInternal: true,
        activityType: 'PLAN_READY_FLAG',
      },
    });

    return NextResponse.json({ success: true, planReadyToStart: ready });
  } catch (error) {
    console.error('[AI Plan Ready]', error);
    return NextResponse.json({ error: 'Failed to update readiness' }, { status: 500 });
  }
}
