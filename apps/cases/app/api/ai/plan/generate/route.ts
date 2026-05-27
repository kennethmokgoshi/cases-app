import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { z } from 'zod';
import { checkConfidence, generatePlan } from '@zenowethu/plan-engine';

const schema = z.object({
  caseId: z.string().min(1),
  force: z.boolean().optional().default(false),
  userGuidance: z.string().max(2000).optional(),
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

    const { caseId, force, userGuidance } = parsed.data;

    const caseRecord = await prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true, acquisitionType: true, services: true, planReadyToStart: true },
    });

    if (!caseRecord) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    // All cases: require staff to tick "Information sufficient to proceed"
    if (!caseRecord.planReadyToStart) {
      return NextResponse.json(
        { error: 'Case requires staff to mark information as sufficient before plan generation.' },
        { status: 403 },
      );
    }

    // Check existing plan
    const existingPlan = await prisma.casePlan.findUnique({ where: { caseId } });
    if (existingPlan) {
      const isRegeneratable = existingPlan.status === 'DRAFT' || force;
      if (!isRegeneratable) {
        return NextResponse.json(
          { error: `Plan already exists with status: ${existingPlan.status}. Use force regenerate.` },
          { status: 409 },
        );
      }
      // Block regeneration of plans that are actively running
      if (existingPlan.status === 'IN_PROGRESS') {
        return NextResponse.json(
          { error: 'Cannot regenerate a plan that is currently in progress.' },
          { status: 409 },
        );
      }
    }

    // Check confidence (must have required docs)
    let isFlagRemoval = false;
    try {
      const services = caseRecord.services ? JSON.parse(caseRecord.services as string) : [];
      isFlagRemoval = services.includes('debt_review_flag_removal');
    } catch {}

    const confidence = await checkConfidence(caseId, isFlagRemoval);
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
    const generated = await generatePlan(caseId, userGuidance);

    // Track version across regenerations
    const nextVersion = existingPlan ? existingPlan.version + 1 : 1;

    // Delete existing plan if re-generating
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
        version: nextVersion,
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
        content: `AI Plan v${nextVersion} generated: ${generated.caseType} — ${generated.summary} (${generated.steps.length} steps)${userGuidance ? ` | Guidance: "${userGuidance.slice(0, 200)}"` : ''}`,
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
