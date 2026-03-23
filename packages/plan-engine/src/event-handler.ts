import { prisma } from '@zenowethu/database';
import { logger } from '@zenowethu/shared-lib';
import { evaluateNewInfo } from './evaluator';
import type { PlanEventPayload } from './types';

export async function handlePlanEvent(payload: PlanEventPayload): Promise<void> {
  const { caseId, eventSource, eventType, eventData, description } = payload;

  const plan = await prisma.casePlan.findUnique({
    where: { caseId },
    include: {
      steps: { orderBy: { stepNumber: 'asc' } },
      case: { include: { client: true } },
    },
  });

  if (!plan || !['IN_PROGRESS', 'PAUSED', 'APPROVED'].includes(plan.status)) {
    logger.info(`[EventHandler] No active plan for case ${caseId}. Ignored.`);
    return;
  }

  const planEvent = await prisma.casePlanEvent.create({
    data: {
      planId: plan.id,
      eventSource,
      eventType,
      eventData: JSON.parse(JSON.stringify(eventData ?? {})),
      notifiedAt: new Date(),
    },
  });

  const evaluation = await evaluateNewInfo(plan.id, description);

  let title = `New Information — ${plan.case.fileNumber}`;
  let message = '';

  if (evaluation.changeType === 'NO_CHANGE') {
    message = `New info from ${eventSource}: "${description}"\n\nDoes not affect the current workflow. Plan continues.`;
  } else if (evaluation.changeType === 'PARTIAL_CHANGE') {
    title = `Workflow Updated — ${plan.case.fileNumber}`;
    message = `New info from ${eventSource}: "${description}"\n\n${evaluation.notificationMessage}\n\nAffected steps: ${evaluation.affectedStepNumbers.join(', ')}.`;
    await prisma.casePlan.update({ where: { id: plan.id }, data: { status: 'PAUSED' } });
    if (evaluation.updatedSteps) {
      for (const upd of evaluation.updatedSteps) {
        const step = plan.steps.find(
          (s) => s.stepNumber === upd.stepNumber && s.status === 'PENDING',
        );
        if (step) {
          const changes = upd.changes as { description?: string };
          await prisma.casePlanStep.update({
            where: { id: step.id },
            data: { description: changes.description || step.description },
          });
        }
      }
    }
  } else {
    title = `Plan Needs Re-evaluation — ${plan.case.fileNumber}`;
    message = `New info from ${eventSource}: "${description}"\n\n${evaluation.notificationMessage}\n\nThis significantly changes the workflow. Please review and regenerate the plan if needed.`;
    await prisma.casePlan.update({ where: { id: plan.id }, data: { status: 'PAUSED' } });
  }

  const activeStep = plan.steps.find((s) => s.status === 'IN_PROGRESS');
  if (activeStep && evaluation.changeType !== 'NO_CHANGE') {
    await prisma.casePlanStep.update({
      where: { id: activeStep.id },
      data: { status: 'WAITING_FOR_USER', pausedAt: new Date() },
    });
  }

  if (plan.case.assignedToId) {
    await prisma.inAppNotification.create({
      data: {
        userId: plan.case.assignedToId,
        type: 'AI_PLAN_EVENT',
        title,
        message,
        caseId: plan.caseId,
        linkUrl: `/cases/${plan.caseId}?tab=AI_PLAN`,
      },
    });
  }

  await prisma.casePlanEvent.update({
    where: { id: planEvent.id },
    data: { resolvedAt: new Date() },
  });

  logger.info(`[EventHandler] Case ${caseId}: ${evaluation.changeType}`);
}
