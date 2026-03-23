import { prisma } from '@zenowethu/database';
import { logger } from '@zenowethu/shared-lib';
import { stepRegistry } from './step-registry';
import type { StepExecutionResult } from './types';

interface CaseWithClient {
  id: string;
  fileNumber: string;
  assignedToId: string | null;
  client: {
    firstName: string;
    lastName: string;
  };
}

async function notifyStaff(
  caseRecord: CaseWithClient,
  planId: string,
  stepId: string | null,
  message: string,
): Promise<void> {
  try {
    if (!caseRecord.assignedToId) return;
    await prisma.inAppNotification.create({
      data: {
        userId: caseRecord.assignedToId,
        type: 'AI_PLAN',
        title: `AI Plan — ${caseRecord.fileNumber}`,
        message,
        caseId: caseRecord.id,
        linkUrl: `/cases/${caseRecord.id}?tab=AI_PLAN${stepId ? `&stepId=${stepId}` : ''}`,
      },
    });
  } catch (err) {
    logger.error(err, '[Executor] Failed to notify staff');
  }
}

export async function startPlanExecution(planId: string, userId: string): Promise<void> {
  const plan = await prisma.casePlan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error(`Plan ${planId} not found`);
  if (plan.status !== 'APPROVED') throw new Error(`Plan must be APPROVED. Current: ${plan.status}`);
  await prisma.casePlan.update({ where: { id: planId }, data: { status: 'IN_PROGRESS' } });
  await executeNextStep(planId, userId);
}

export async function executeNextStep(planId: string, userId: string): Promise<void> {
  const plan = await prisma.casePlan.findUnique({
    where: { id: planId },
    include: {
      steps: { orderBy: { stepNumber: 'asc' } },
      case: { include: { client: true } },
    },
  });

  if (!plan || plan.status === 'CANCELLED' || plan.status === 'COMPLETED') return;

  const nextStep = plan.steps.find((s) => s.status === 'PENDING');

  if (!nextStep) {
    await prisma.casePlan.update({ where: { id: planId }, data: { status: 'COMPLETED' } });
    await notifyStaff(
      plan.case as CaseWithClient,
      planId,
      null,
      'AI Plan completed — all steps executed successfully.',
    );
    return;
  }

  if (nextStep.breakpointBefore) {
    await prisma.casePlan.update({ where: { id: planId }, data: { status: 'PAUSED' } });
    await prisma.casePlanStep.update({
      where: { id: nextStep.id },
      data: { status: 'WAITING_FOR_USER', pausedAt: new Date() },
    });
    await notifyStaff(
      plan.case as CaseWithClient,
      planId,
      nextStep.id,
      `Paused before Step ${nextStep.stepNumber}: "${nextStep.title}". Click Resume when ready.`,
    );
    return;
  }

  if (nextStep.requiresApproval) {
    await prisma.casePlanStep.update({
      where: { id: nextStep.id },
      data: { status: 'WAITING_FOR_USER' },
    });
    await notifyStaff(
      plan.case as CaseWithClient,
      planId,
      nextStep.id,
      `Step ${nextStep.stepNumber} requires your approval: "${nextStep.title}". Please review and approve.`,
    );
    return;
  }

  await prisma.casePlanStep.update({
    where: { id: nextStep.id },
    data: { status: 'IN_PROGRESS', executedAt: new Date() },
  });

  let execResult: StepExecutionResult;
  try {
    const action = stepRegistry.getAction(nextStep.actionType as Parameters<typeof stepRegistry.getAction>[0]);
    execResult = await action({
      caseId: plan.caseId,
      planId,
      stepId: nextStep.id,
      actionParams: nextStep.actionParams as Record<string, unknown>,
      caseRecord: plan.case,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    execResult = { success: false, error: message };
  }

  if (!execResult.success) {
    await prisma.casePlanStep.update({
      where: { id: nextStep.id },
      data: { status: 'FAILED', error: execResult.error, completedAt: new Date() },
    });
    await notifyStaff(
      plan.case as CaseWithClient,
      planId,
      nextStep.id,
      `Step ${nextStep.stepNumber} failed: "${nextStep.title}". Error: ${execResult.error}. Please review.`,
    );
    return;
  }

  if (nextStep.waitingForEvent) {
    await prisma.casePlanStep.update({
      where: { id: nextStep.id },
      data: {
        status: 'WAITING_FOR_USER',
        pausedAt: new Date(),
        result: JSON.parse(JSON.stringify(execResult.result ?? {})),
      },
    });
    await notifyStaff(
      plan.case as CaseWithClient,
      planId,
      nextStep.id,
      `Step ${nextStep.stepNumber} sent — waiting for: ${nextStep.waitingForEvent}. You will be notified when a response arrives.`,
    );
    return;
  }

  await prisma.casePlanStep.update({
    where: { id: nextStep.id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      result: JSON.parse(JSON.stringify(execResult.result ?? {})),
    },
  });

  if (nextStep.breakpointAfter) {
    await prisma.casePlan.update({ where: { id: planId }, data: { status: 'PAUSED' } });
    await notifyStaff(
      plan.case as CaseWithClient,
      planId,
      nextStep.id,
      `Step ${nextStep.stepNumber} done: "${nextStep.title}". You requested review after this step. Click Resume to continue.`,
    );
    return;
  }

  await notifyStaff(
    plan.case as CaseWithClient,
    planId,
    nextStep.id,
    `Step ${nextStep.stepNumber} done: "${nextStep.title}". Continuing...`,
  );

  await executeNextStep(planId, userId);
}
