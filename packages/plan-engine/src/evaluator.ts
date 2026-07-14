import { prisma } from '@zenowethu/database';
import { logger, getAiClientForTask } from '@zenowethu/shared-lib';
import type { PlanEvaluationResult, ChangeType } from './types';

export async function evaluateNewInfo(
  planId: string,
  newInfoDescription: string,
): Promise<PlanEvaluationResult> {
  const { client, model: modelId } = await getAiClientForTask('plan_generation');

  const plan = await prisma.casePlan.findUnique({
    where: { id: planId },
    include: {
      steps: { orderBy: { stepNumber: 'asc' } },
      case: {
        include: {
          client: true,
          documents: {
            select: {
              type: true,
              fileName: true,
              analyzedAt: true,
              extractedData: true,
              uploadedAt: true,
            },
            orderBy: { uploadedAt: 'desc' },
            take: 20,
          },
          comments: {
            select: {
              content: true,
              type: true,
              activityType: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 30,
          },
        },
      },
    },
  });

  if (!plan) throw new Error(`Plan ${planId} not found`);

  const pending = plan.steps.filter(
    (s) => s.status === 'PENDING' || s.status === 'WAITING_FOR_USER',
  );
  const completed = plan.steps.filter((s) => s.status === 'COMPLETED');

  // Recent activity summary
  const recentActivity = plan.case.comments
    .filter((c) => c.activityType && c.activityType !== 'AI_PLAN_GENERATED')
    .slice(0, 10)
    .map((c) => `[${c.createdAt.toISOString().slice(0, 10)}] ${c.activityType}: ${c.content.slice(0, 150)}`)
    .join('\n');

  // Recent emails
  const recentEmails = plan.case.comments
    .filter((c) => c.type === 'EMAIL')
    .slice(0, 5)
    .map((c) => `[${c.createdAt.toISOString().slice(0, 10)}] ${c.content.slice(0, 200)}`)
    .join('\n');

  // Documents
  const docSummary = plan.case.documents
    .map((d) => `${d.type} (${d.fileName})${d.analyzedAt ? ' analyzed' : ' not analyzed'}`)
    .join(', ') || 'None';

  const response = await client.chat.completions.create({
    model: modelId,
    max_tokens: 2048,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You evaluate whether new information affects an active South African debt counselling workflow plan, considering all prior activities and communications. Respond with JSON only.',
      },
      {
        role: 'user',
        content: `CASE: ${plan.case.fileNumber} | CLIENT: ${plan.case.client.firstName} ${plan.case.client.lastName}
DOCUMENTS: ${docSummary}
${recentActivity ? `RECENT ACTIVITY:\n${recentActivity}` : ''}
${recentEmails ? `RECENT EMAILS:\n${recentEmails}` : ''}

COMPLETED STEPS: ${completed.map((s) => `Step ${s.stepNumber}: ${s.title}`).join(', ') || 'None'}

REMAINING STEPS:
${pending.map((s) => `Step ${s.stepNumber} [${s.ownerApp}]: ${s.title} — ${s.description}`).join('\n')}

NEW INFORMATION: "${newInfoDescription}"

Based on the new information AND the full context above (activity history, emails, documents), assess the impact on the remaining workflow. Consider whether this new info changes what needs to happen next, makes certain steps redundant, or creates new urgency.

Respond with JSON only:
{
  "changeType": "NO_CHANGE|PARTIAL_CHANGE|MAJOR_CHANGE",
  "summary": "brief summary of impact",
  "affectedStepNumbers": [],
  "notificationMessage": "plain English message for staff explaining what changed and why",
  "updatedSteps": [{"stepNumber": 1, "changes": {"description": "updated description"}}]
}`,
      },
    ],
  });

  const text = response.choices[0].message.content || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in Claude response');

  const raw = JSON.parse(jsonMatch[0] as string) as {
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
