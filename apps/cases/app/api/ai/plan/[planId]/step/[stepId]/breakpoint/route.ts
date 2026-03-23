import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { z } from 'zod';

const schema = z.object({
  breakpointBefore: z.boolean().optional(),
  breakpointAfter: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
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

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400 });
    }

    const updateData: { breakpointBefore?: boolean; breakpointAfter?: boolean } = {};
    if (parsed.data.breakpointBefore !== undefined) {
      updateData.breakpointBefore = parsed.data.breakpointBefore;
    }
    if (parsed.data.breakpointAfter !== undefined) {
      updateData.breakpointAfter = parsed.data.breakpointAfter;
    }

    const updated = await prisma.casePlanStep.update({
      where: { id: stepId },
      data: updateData,
    });

    return NextResponse.json({ step: updated });
  } catch (error) {
    console.error('[AI Plan Breakpoint]', error);
    return NextResponse.json({ error: 'Failed to update breakpoint' }, { status: 500 });
  }
}
