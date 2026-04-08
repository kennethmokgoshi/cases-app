import path from 'path';
import fs from 'fs';
import { prisma } from '@zenowethu/database';
import { logger } from '@zenowethu/shared-lib';
import { requestTransfer, closeBrowser } from '@zenowethu/shared-lib/src/dhs';
import { stepRegistry } from '../step-registry';
import type { ActionContext } from '../step-registry';
import type { StepExecutionResult } from '../types';

const resolveUploadPath = (fileUrl: string): string => {
  const relative = fileUrl.replace(/^\/uploads\//, '');
  return path.join(process.cwd(), 'storage', 'uploads', relative);
};

stepRegistry.register('DHS_SEARCH', async (ctx: ActionContext): Promise<StepExecutionResult> => {
  try {
    const { caseId, caseRecord } = ctx;
    logger.info(`[DHS_SEARCH] Case ${caseId}: searching DHS for ${caseRecord.client.idNumber}`);
    // Log the action as a case comment
    await prisma.caseComment.create({
      data: {
        caseId,
        userId: caseRecord.assignedToId || 'system',
        content: `[AI Plan] DHS Search initiated for ID: ${caseRecord.client.idNumber}`,
        type: 'AI_PLAN',
        isInternal: true,
        activityType: 'DHS_SEARCH',
      },
    });
    return {
      success: true,
      result: {
        action: 'DHS_SEARCH',
        idNumber: caseRecord.client.idNumber,
        initiatedAt: new Date().toISOString(),
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
});

stepRegistry.register(
  'DHS_TRANSFER_REQUEST',
  async (ctx: ActionContext): Promise<StepExecutionResult> => {
    const { caseId, planId, stepId, caseRecord } = ctx;
    logger.info(`[DHS_TRANSFER_REQUEST] Case ${caseId}: executing approved DHS transfer (plan ${planId}, step ${stepId})`);

    try {
      // Load full case with documents
      const caseData = await prisma.case.findUnique({
        where: { id: caseId },
        include: { documents: true },
      });

      if (!caseData) return { success: false, error: 'Case not found' };

      // Resolve POA document — prefer ZENOWETHU_POA, fall back to POA
      const poaDoc =
        caseData.documents.find((d) => d.type === 'ZENOWETHU_POA') ||
        caseData.documents.find((d) => d.type === 'POA' || d.fileName?.toLowerCase().includes('poa'));

      // Resolve ID document
      const idDoc =
        caseData.documents.find((d) => d.type === 'ID') ||
        caseData.documents.find(
          (d) => d.fileName?.toLowerCase().includes('id') && !d.fileName?.toLowerCase().includes('credit'),
        );

      if (!poaDoc || !idDoc) {
        const missing = [!poaDoc && 'POA', !idDoc && 'ID'].filter(Boolean).join(', ');
        return { success: false, error: `Missing required documents: ${missing}` };
      }

      const poaPath = resolveUploadPath(poaDoc.fileUrl);
      const idPath = resolveUploadPath(idDoc.fileUrl);

      if (!fs.existsSync(poaPath)) return { success: false, error: `POA file not found on disk: ${poaPath}` };
      if (!fs.existsSync(idPath)) return { success: false, error: `ID file not found on disk: ${idPath}` };

      // Execute DHS Puppeteer automation
      const result = await requestTransfer(caseData.client?.idNumber || caseRecord.client.idNumber, poaPath, idPath);

      await closeBrowser();

      if (!result.success) {
        return { success: false, error: result.message || 'DHS transfer request failed' };
      }

      // Update case status
      const prevStatus = caseData.status;
      await prisma.case.update({
        where: { id: caseId },
        data: { dhsStatus: 'PENDING', status: 'DHS_REQUESTED' },
      });

      await prisma.workflowLog.create({
        data: {
          caseId,
          fromStatus: prevStatus,
          toStatus: 'DHS_REQUESTED',
          action: 'AI_PLAN_DHS_TRANSFER',
          userId: caseRecord.assignedToId,
          notes: `DHS transfer submitted via approved AI Plan (plan: ${planId}, step: ${stepId})`,
        },
      });

      await prisma.caseComment.create({
        data: {
          caseId,
          userId: caseRecord.assignedToId || 'system',
          content: `[AI Plan] DHS Transfer Request submitted successfully. Case status updated to DHS_REQUESTED. DHS reference: ${result.requestId || 'N/A'}`,
          type: 'AI_PLAN',
          isInternal: true,
          activityType: 'DHS_TRANSFER_REQUEST',
        },
      });

      return {
        success: true,
        result: {
          action: 'DHS_TRANSFER_REQUEST',
          dhsRequestId: result.requestId,
          fromStatus: prevStatus,
          toStatus: 'DHS_REQUESTED',
          submittedAt: new Date().toISOString(),
        },
      };
    } catch (err: unknown) {
      await closeBrowser().catch(() => {});
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`[DHS_TRANSFER_REQUEST] Case ${caseId} failed: ${message}`);
      return { success: false, error: message };
    }
  },
);

stepRegistry.register(
  'REQUEST_FILE_FROM_DC',
  async (ctx: ActionContext): Promise<StepExecutionResult> => {
    try {
      const { caseId, caseRecord } = ctx;
      const caseWithDC = await prisma.case.findUnique({
        where: { id: caseId },
        select: { dcEmail: true, debtCounsellorName: true },
      });
      logger.info(
        `[REQUEST_FILE_FROM_DC] Case ${caseId}: requesting file from DC ${caseWithDC?.debtCounsellorName}`,
      );
      await prisma.caseComment.create({
        data: {
          caseId,
          userId: caseRecord.assignedToId || 'system',
          content: `[AI Plan] File request sent to DC: ${caseWithDC?.debtCounsellorName || 'Unknown'} (${caseWithDC?.dcEmail || 'no email'})`,
          type: 'AI_PLAN',
          isInternal: true,
          activityType: 'REQUEST_FILE_FROM_DC',
        },
      });
      return {
        success: true,
        result: {
          action: 'REQUEST_FILE_FROM_DC',
          dcName: caseWithDC?.debtCounsellorName,
          dcEmail: caseWithDC?.dcEmail,
          requestedAt: new Date().toISOString(),
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  },
);

stepRegistry.register('STATUS_UPDATE', async (ctx: ActionContext): Promise<StepExecutionResult> => {
  try {
    const { caseId, caseRecord, actionParams } = ctx;
    const newStatus = actionParams.status as string;
    if (!newStatus) return { success: false, error: 'No status provided in actionParams' };
    const currentCase = await prisma.case.findUnique({
      where: { id: caseId },
      select: { status: true },
    });
    await prisma.case.update({ where: { id: caseId }, data: { status: newStatus } });
    await prisma.workflowLog.create({
      data: {
        caseId,
        fromStatus: currentCase?.status,
        toStatus: newStatus,
        action: 'AI_PLAN_STATUS_UPDATE',
        userId: caseRecord.assignedToId,
        notes: (actionParams.notes as string) || 'Automated by AI Plan Engine',
      },
    });
    logger.info(`[STATUS_UPDATE] Case ${caseId}: ${currentCase?.status} → ${newStatus}`);
    return { success: true, result: { fromStatus: currentCase?.status, toStatus: newStatus } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
});

stepRegistry.register(
  'DOCUMENT_REQUEST_CLIENT',
  async (ctx: ActionContext): Promise<StepExecutionResult> => {
    try {
      const { caseId, caseRecord, actionParams } = ctx;
      const docType = (actionParams.documentType as string) || 'document';
      await prisma.caseComment.create({
        data: {
          caseId,
          userId: caseRecord.assignedToId || 'system',
          content: `[AI Plan] Document request sent to client for: ${docType}`,
          type: 'AI_PLAN',
          isInternal: true,
          activityType: 'DOCUMENT_REQUEST_CLIENT',
        },
      });
      return {
        success: true,
        result: { action: 'DOCUMENT_REQUEST_CLIENT', documentType: docType },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  },
);

stepRegistry.register(
  'NCT_STATUS_CHECK',
  async (ctx: ActionContext): Promise<StepExecutionResult> => {
    try {
      const { caseId } = ctx;
      const caseRecord = await prisma.case.findUnique({
        where: { id: caseId },
        select: { nctCaseNumber: true, nctStatus: true, nctLastUpdated: true },
      });
      logger.info(`[NCT_STATUS_CHECK] Case ${caseId}: NCT status ${caseRecord?.nctStatus}`);
      return {
        success: true,
        result: {
          nctCaseNumber: caseRecord?.nctCaseNumber,
          nctStatus: caseRecord?.nctStatus,
          nctLastUpdated: caseRecord?.nctLastUpdated?.toISOString(),
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  },
);
