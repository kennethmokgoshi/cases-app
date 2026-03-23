import { prisma } from '@zenowethu/database';
import { logger } from '@zenowethu/shared-lib';
import { stepRegistry } from '../step-registry';
import type { ActionContext } from '../step-registry';
import type { StepExecutionResult } from '../types';

stepRegistry.register(
  'OPEN_FORENSIC_AUDIT',
  async (ctx: ActionContext): Promise<StepExecutionResult> => {
    try {
      const { caseId, caseRecord } = ctx;

      const existing = await prisma.forensicAudit.findFirst({ where: { caseId } });
      if (existing) {
        logger.info(`[OPEN_FORENSIC_AUDIT] Case ${caseId}: audit already exists ${existing.id}`);
        return { success: true, result: { auditId: existing.id, existing: true } };
      }

      const auditId = `audit_${Date.now()}_${caseId.slice(-6)}`;
      const audit = await prisma.forensicAudit.create({
        data: {
          id: auditId,
          caseId,
          status: 'PENDING',
          auditorId: caseRecord.assignedToId,
        },
      });

      logger.info(`[OPEN_FORENSIC_AUDIT] Case ${caseId}: audit ${audit.id} opened`);
      return { success: true, result: { auditId: audit.id, status: audit.status } };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  },
);

stepRegistry.register(
  'RECKLESS_LENDING_ASSESSMENT',
  async (ctx: ActionContext): Promise<StepExecutionResult> => {
    try {
      const { caseId, caseRecord } = ctx;

      const caseData = await prisma.case.findUnique({
        where: { id: caseId },
        include: {
          client: { select: { netSalary: true, grossSalary: true } },
          creditAccounts: { where: { isIncluded: true }, select: { monthlyInstalment: true, outstandingBalance: true } },
        },
      });

      if (!caseData) return { success: false, error: 'Case not found' };

      const netSalary = Number(caseData.client.netSalary || 0);
      const totalInstalment = caseData.creditAccounts.reduce(
        (sum, a) => sum + Number(a.monthlyInstalment || 0),
        0,
      );
      const totalDebt = caseData.creditAccounts.reduce(
        (sum, a) => sum + Number(a.outstandingBalance || 0),
        0,
      );

      const ratio = netSalary > 0 ? totalInstalment / netSalary : 0;
      const isReckless = ratio > 0.5;

      logger.info(
        `[RECKLESS_LENDING_ASSESSMENT] Case ${caseId}: ratio=${ratio.toFixed(2)}, reckless=${isReckless}`,
      );

      await prisma.caseComment.create({
        data: {
          caseId,
          userId: caseRecord.assignedToId || 'system',
          content: `[AI Plan] Reckless Lending Assessment: Monthly instalments R${totalInstalment.toFixed(0)} vs Net Salary R${netSalary.toFixed(0)} (${(ratio * 100).toFixed(0)}%). ${isReckless ? 'POTENTIALLY RECKLESS — recommend forensic audit.' : 'Within acceptable limits.'}`,
          type: 'AI_PLAN',
          isInternal: true,
          activityType: 'RECKLESS_LENDING_ASSESSMENT',
        },
      });

      return {
        success: true,
        result: {
          netSalary,
          totalInstalment,
          totalDebt,
          ratio: parseFloat(ratio.toFixed(4)),
          isReckless,
          recommendation: isReckless
            ? 'Open forensic audit and assess for reckless lending claim'
            : 'No reckless lending indicators found',
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  },
);
