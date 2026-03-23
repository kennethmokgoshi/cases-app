import { prisma } from '@zenowethu/database';
import { logger } from '@zenowethu/shared-lib';
import OpenAI from 'openai';
import type { PlanEvaluationResult, ChangeType } from './types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function evaluateNewInfo(
  planId: string,
  newInfoDescription: string,
): Promise<PlanEvaluationResult> {
  const plan = await prisma.casePlan.findUnique({
    where: { id: planId },
    include: {
      steps: { orderBy: { stepNumber: 'asc' } },
      case: { include: { client: true } },
    },
  });

  if (!plan) throw new Error(`Plan ${planId} not found`);

  const pending = plan.steps.filter(
    (s) => s.status === 'PENDING' || s.status === 'WAITING_FOR_USER',
  );
  const completed = plan.steps.filter((s) => s.status === 'COMPLETED');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content:
          'You evaluate whether new information affects an active debt counselling workflow plan.',
      },
      {
        role: 'user',
        content: `CASE: ${plan.case.fileNumber} | CLIENT: ${plan.case.client.firstName} ${plan.case.client.lastName}
COMPLETED: ${completed.map((s) => `Step ${s.stepNumber}: ${s.title}`).join(', ') || 'None'}
REMAINING:\n${pending.map((s) => `Step ${s.stepNumber} [${s.ownerApp}]: ${s.title} — ${s.description}`).join('\n')}
NEW INFO: "${newInfoDescription}"

Respond JSON: { "changeType": "NO_CHANGE|PARTIAL_CHANGE|MAJOR_CHANGE", "summary": "...", "affectedStepNumbers": [], "notificationMessage": "plain English for staff", "updatedSteps": [{"stepNumber": N, "changes": {"description": "..."}}] }`,
      },
    ],
    response_format: { type: 'json_object' },
  });

  const raw = JSON.parse(response.choices[0].message.content || '{}') as {
    changeType?: string;
    summary?: string;
    affectedStepNumbers?: number[];
    notificationMessage?: string;
    updatedSteps?: Array<{ stepNumber: number; changes: Record<string, unknown> }>;
  };

  const result: PlanEvaluationResult = {
    changeType: (raw.changeType as ChangeType) || 'NO_CHANGE',
    summary: raw.summary || '',
    affectedStepNumbers: raw.affectedStepNumbers || [],
    updatedSteps: raw.updatedSteps || [],
    notificationMessage:
      raw.notificationMessage || `New info received. Workflow reviewed — no changes required.`,
  };

  await prisma.casePlanUpdate.create({
    data: {
      planId,
      newInfoDescription,
      changeType: result.changeType,
      affectedStepNumbers: result.affectedStepNumbers,
      previousStepsSnapshot: pending.map((s) => ({
        stepNumber: s.stepNumber,
        title: s.title,
        status: s.status,
      })),
    },
  });

  logger.info(`[Evaluator] Plan ${planId}: ${result.changeType}`);
  return result;
}
