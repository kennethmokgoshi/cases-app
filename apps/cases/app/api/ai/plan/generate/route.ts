import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { z } from 'zod';
import { checkConfidence, generatePlan } from '@zenowethu/plan-engine';

const schema = z.object({ caseId: z.string().min(1) });

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

    const { caseId } = parsed.data;

    const caseRecord = await prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true, acquisitionType: true, planReadyToStart: true },
    });

    if (!caseRecord) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    // B2B: require staff to tick "Information sufficient to proceed"
    if (caseRecord.acquisitionType === 'B2B' && !caseRecord.planReadyToStart) {
      return NextResponse.json(
        { error: 'B2B case requires staff to mark information as sufficient before plan generation.' },
        { status: 403 },
      );
    }

    // Check existing plan — only regenerate DRAFT plans
    const existingPlan = await prisma.casePlan.findUnique({ where: { caseId } });
    if (existingPlan && existingPlan.status !== 'DRAFT') {
      return NextResponse.json(
        { error: `Plan already exists with status: ${existingPlan.status}. Cannot regenerate.` },
        { status: 409 },
      );
    }

    // Check confidence (must have required docs)
    const confidence = await checkConfidence(caseId);
    if (!confidence.canProceed) {
      return NextResponse.json(
        {
          error: 'Insufficient documents to generate plan.',
          missingRequired: confidence.missingRequired,
          confidence,
        },
        { status: 422 },
      );
    }

    // Generate plan via AI
    const generated = await generatePlan(caseId);

    // Delete existing draft if re-generating
    if (existingPlan) {
      await prisma.casePlan.delete({ where: { id: existingPlan.id } });
    }

    // Persist plan + steps
    const plan = await prisma.casePlan.create({
      data: {
        caseId,
        status: 'AWAITING_APPROVAL',
        confidenceScore: confidence.score,
        missingInfo: JSON.parse(JSON.stringify(confidence.missingOptional)),
        caseType: generated.caseType,
        readyToStart: true,
        steps: {
          create: generated.steps.map((step) => ({
            stepNumber: step.stepNumber,
            title: step.title,
            description: step.description,
            ownerApp: step.ownerApp,
            category: step.category,
            actionType: step.actionType,
            actionParams: JSON.parse(JSON.stringify(step.actionParams)),
            requiresApproval: step.requiresApproval,
            waitingForEvent: step.waitingForEvent,
            timeoutHours: step.timeoutHours,
            timeoutAction: step.timeoutAction,
            status: 'PENDING',
          })),
        },
      },
      include: { steps: { orderBy: { stepNumber: 'asc' } } },
    });

    // Log activity
    await prisma.caseComment.create({
      data: {
        caseId,
        userId: session.user.id,
        content: `AI Plan generated: ${generated.caseType} — ${generated.summary} (${generated.steps.length} steps)`,
        type: 'AI_PLAN',
        isInternal: true,
        activityType: 'AI_PLAN_GENERATED',
      },
    });

    return NextResponse.json({ plan, confidence, summary: generated.summary });
  } catch (error) {
    console.error('[AI Plan Generate]', error);
    return NextResponse.json({ error: 'Failed to generate plan' }, { status: 500 });
  }
}
