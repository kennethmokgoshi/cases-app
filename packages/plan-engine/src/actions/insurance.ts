import { prisma } from '@zenowethu/database';
import { logger } from '@zenowethu/shared-lib';
import { stepRegistry } from '../step-registry';
import type { ActionContext } from '../step-registry';
import type { StepExecutionResult } from '../types';

stepRegistry.register(
  'INSURANCE_ASSESSMENT',
  async (ctx: ActionContext): Promise<StepExecutionResult> => {
    try {
      const { caseId, caseRecord } = ctx;

      const existing = await prisma.insuranceAssessment.findFirst({ where: { caseId } });
      if (existing) {
        logger.info(`[INSURANCE_ASSESSMENT] Case ${caseId}: assessment already exists ${existing.id}`);
        return { success: true, result: { assessmentId: existing.id, existing: true } };
      }

      const accounts = await prisma.creditAccount.findMany({
        where: { caseId, isIncluded: true, hasInsurance: true },
        select: { id: true, premiumAmount: true },
      });

      const totalCurrentPremium = accounts.reduce(
        (sum, a) => sum + Number(a.premiumAmount || 0),
        0,
      );

      const assessment = await prisma.insuranceAssessment.create({
        data: {
          caseId,
          clientId: caseRecord.clientId,
          totalCurrentPremium,
          totalAccounts: accounts.length,
          status: 'DRAFT',
        },
      });

      logger.info(
        `[INSURANCE_ASSESSMENT] Case ${caseId}: created assessment ${assessment.id}, total premium R${totalCurrentPremium}`,
      );
      return {
        success: true,
        result: { assessmentId: assessment.id, totalCurrentPremium, accountCount: accounts.length },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  },
);

stepRegistry.register(
  'DRAFT_CANCELLATION_LETTER',
  async (ctx: ActionContext): Promise<StepExecutionResult> => {
    try {
      const { caseId, actionParams } = ctx;
      const creditorName = actionParams.creditorName as string;
      const accountNumber = actionParams.accountNumber as string | undefined;

      let assessmentId = actionParams.assessmentId as string | undefined;
      if (!assessmentId) {
        const assessment = await prisma.insuranceAssessment.findFirst({ where: { caseId } });
        if (!assessment) {
          return { success: false, error: 'No insurance assessment found. Run INSURANCE_ASSESSMENT first.' };
        }
        assessmentId = assessment.id;
      }

      const letter = await prisma.cancellationLetter.create({
        data: {
          assessmentId,
          creditorName: creditorName || 'Unknown Creditor',
          accountNumber,
          letterType: 'CREDIT_LIFE_CANCELLATION',
          status: 'DRAFT',
          letterContent: `Dear Sir/Madam,\n\nThis letter serves as formal notice of cancellation of the credit life insurance policy attached to account${accountNumber ? ` ${accountNumber}` : ''} with ${creditorName}.\n\nThe insured hereby exercises their right to cancel in terms of the Long-Term Insurance Act and the National Credit Act.\n\nYours faithfully,\nZenowethu Debt Counsellors`,
        },
      });

      logger.info(`[DRAFT_CANCELLATION_LETTER] Case ${caseId}: letter ${letter.id} drafted for ${creditorName}`);
      return { success: true, result: { letterId: letter.id, assessmentId, creditorName } };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  },
);

stepRegistry.register(
  'SEND_CANCELLATION_LETTER',
  async (ctx: ActionContext): Promise<StepExecutionResult> => {
    try {
      const { actionParams } = ctx;
      const letterId = actionParams.letterId as string;
      if (!letterId) return { success: false, error: 'letterId required in actionParams' };

      await prisma.cancellationLetter.update({
        where: { id: letterId },
        data: { status: 'SENT', sentAt: new Date(), sentVia: (actionParams.via as string) || 'EMAIL' },
      });

      logger.info(`[SEND_CANCELLATION_LETTER] Letter ${letterId} sent`);
      return { success: true, result: { letterId, sentAt: new Date().toISOString() } };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  },
);
