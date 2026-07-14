import { prisma } from '@zenowethu/database';
import { logger } from '@zenowethu/shared-lib';
import type { ActionContext, ActionHandler } from '../step-registry';
import type { ActionType, StepExecutionResult } from '../types';

/** Handlers exported as a plain map — step-registry merges these explicitly (no side-effect imports). */
export const legalActions = new Map<ActionType, ActionHandler>();
function registerAction(actionType: ActionType, handler: ActionHandler): void {
  legalActions.set(actionType, handler);
}

const THREE_YEARS_MS = 3 * 365 * 24 * 60 * 60 * 1000;

registerAction(
  'PRESCRIPTION_CHECK',
  async (ctx: ActionContext): Promise<StepExecutionResult> => {
    try {
      const { caseId } = ctx;
      const accounts = await prisma.creditAccount.findMany({
        where: { caseId, isIncluded: true },
        select: { id: true, creditorName: true, lastPaymentDate: true, isPrescribed: true },
      });

      const now = new Date();
      let updatedCount = 0;

      for (const account of accounts) {
        if (account.lastPaymentDate) {
          const ageMs = now.getTime() - new Date(account.lastPaymentDate).getTime();
          if (ageMs > THREE_YEARS_MS && !account.isPrescribed) {
            await prisma.creditAccount.update({
              where: { id: account.id },
              data: { isPrescribed: true, prescriptionDate: now },
            });
            updatedCount++;
          }
        }
      }

      logger.info(
        `[PRESCRIPTION_CHECK] Case ${caseId}: ${updatedCount} accounts newly marked prescribed`,
      );
      return {
        success: true,
        result: {
          totalAccounts: accounts.length,
          newlyPrescribed: updatedCount,
          checkedAt: now.toISOString(),
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  },
);

registerAction(
  'DRAFT_PRESCRIPTION_LETTER',
  async (ctx: ActionContext): Promise<StepExecutionResult> => {
    try {
      const { caseId, caseRecord, actionParams } = ctx;
      const creditorName = actionParams.creditorName as string;
      const accountNumber = actionParams.accountNumber as string | undefined;

      const client = await prisma.client.findUnique({ where: { id: caseRecord.clientId } });
      if (!client) return { success: false, error: 'Client not found' };

      const legalMatter = await prisma.legalMatter.create({
        data: {
          caseId,
          clientId: caseRecord.clientId,
          matterType: 'PRESCRIPTION',
          creditorName: creditorName || 'Unknown Creditor',
          accountNumber,
          isPrescribed: true,
          status: 'OPEN',
          priority: 'HIGH',
        },
      });

      const letter = await prisma.legalLetter.create({
        data: {
          legalMatterId: legalMatter.id,
          letterType: 'PRESCRIPTION_NOTICE',
          recipientName: creditorName || 'Unknown Creditor',
          subject: `Prescription Notice — ${caseRecord.client.idNumber}`,
          letterContent: `Dear Sir/Madam,\n\nPlease be advised that the debt referenced herein has prescribed in terms of Section 126B of the National Credit Act, No. 34 of 2005, read together with the Prescription Act, No. 68 of 1969.\n\nClient: ${client.firstName} ${client.lastName}\nID: ${client.idNumber}\n\nThis letter serves as formal notice of prescription.\n\nYours faithfully,\nZenowethu Debt Counsellors`,
          status: 'DRAFT',
        },
      });

      logger.info(
        `[DRAFT_PRESCRIPTION_LETTER] Case ${caseId}: drafted letter ${letter.id} for ${creditorName}`,
      );
      return {
        success: true,
        result: { legalMatterId: legalMatter.id, letterId: letter.id, creditorName },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  },
);

registerAction(
  'SEND_PRESCRIPTION_LETTER',
  async (ctx: ActionContext): Promise<StepExecutionResult> => {
    try {
      const { actionParams } = ctx;
      const letterId = actionParams.letterId as string;
      if (!letterId) return { success: false, error: 'letterId required in actionParams' };

      await prisma.legalLetter.update({
        where: { id: letterId },
        data: { status: 'SENT', sentAt: new Date(), sentVia: 'EMAIL' },
      });

      logger.info(`[SEND_PRESCRIPTION_LETTER] Letter ${letterId} marked as SENT`);
      return { success: true, result: { letterId, sentAt: new Date().toISOString() } };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  },
);

registerAction(
  'DRAFT_LEGAL_LETTER',
  async (ctx: ActionContext): Promise<StepExecutionResult> => {
    try {
      const { caseId, caseRecord, actionParams } = ctx;
      const creditorName = actionParams.creditorName as string;
      const letterType = (actionParams.letterType as string) || 'GENERAL';
      const subject = (actionParams.subject as string) || `Legal Notice — ${caseRecord.fileNumber}`;

      let legalMatterId = actionParams.legalMatterId as string | undefined;
      if (!legalMatterId) {
        const matter = await prisma.legalMatter.create({
          data: {
            caseId,
            clientId: caseRecord.clientId,
            matterType: letterType,
            creditorName: creditorName || 'Unknown',
            status: 'OPEN',
          },
        });
        legalMatterId = matter.id;
      }

      const letter = await prisma.legalLetter.create({
        data: {
          legalMatterId,
          letterType,
          recipientName: creditorName || 'Unknown',
          subject,
          letterContent: (actionParams.content as string) || `Legal correspondence for ${creditorName}`,
          status: 'DRAFT',
        },
      });

      logger.info(`[DRAFT_LEGAL_LETTER] Case ${caseId}: letter ${letter.id} drafted`);
      return { success: true, result: { letterId: letter.id, legalMatterId, letterType } };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  },
);

registerAction(
  'SEND_LEGAL_LETTER',
  async (ctx: ActionContext): Promise<StepExecutionResult> => {
    try {
      const { actionParams } = ctx;
      const letterId = actionParams.letterId as string;
      if (!letterId) return { success: false, error: 'letterId required in actionParams' };

      await prisma.legalLetter.update({
        where: { id: letterId },
        data: { status: 'SENT', sentAt: new Date(), sentVia: (actionParams.via as string) || 'EMAIL' },
      });

      logger.info(`[SEND_LEGAL_LETTER] Letter ${letterId} sent`);
      return { success: true, result: { letterId, sentAt: new Date().toISOString() } };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  },
);

registerAction(
  'BUREAU_DISPUTE',
  async (ctx: ActionContext): Promise<StepExecutionResult> => {
    try {
      const { caseId, caseRecord, actionParams } = ctx;
      const creditorName = actionParams.creditorName as string;
      const disputeReason = (actionParams.reason as string) || 'PRESCRIPTION';

      await prisma.caseComment.create({
        data: {
          caseId,
          userId: caseRecord.assignedToId || 'system',
          content: `[AI Plan] Bureau dispute initiated for ${creditorName}: ${disputeReason}`,
          type: 'AI_PLAN',
          isInternal: true,
          activityType: 'BUREAU_DISPUTE',
          activityData: JSON.stringify({ creditorName, disputeReason }),
        },
      });

      logger.info(`[BUREAU_DISPUTE] Case ${caseId}: dispute for ${creditorName}`);
      return { success: true, result: { creditorName, disputeReason, initiatedAt: new Date().toISOString() } };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  },
);
