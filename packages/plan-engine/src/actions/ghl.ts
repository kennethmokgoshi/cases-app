import { prisma } from '@zenowethu/database';
import { logger } from '@zenowethu/shared-lib';
import { stepRegistry } from '../step-registry';
import type { ActionContext } from '../step-registry';
import type { StepExecutionResult } from '../types';

async function logNotification(
  ctx: ActionContext,
  channel: string,
  message: string,
): Promise<StepExecutionResult> {
  const { caseId, caseRecord } = ctx;

  const client = await prisma.client.findUnique({
    where: { id: caseRecord.clientId },
    select: { phone: true, email: true, whatsappNumber: true },
  });

  const recipient =
    channel === 'EMAIL'
      ? (client?.email ?? 'unknown')
      : channel === 'WHATSAPP'
        ? (client?.whatsappNumber ?? client?.phone ?? 'unknown')
        : (client?.phone ?? 'unknown');

  await prisma.notificationLog.create({
    data: {
      caseId,
      channel,
      recipient,
      recipientType: 'CLIENT',
      message,
      success: true,
      provider: 'GoHighLevel',
      senderId: caseRecord.assignedToId,
    },
  });

  logger.info(`[GHL_SEND] Case ${caseId}: ${channel} to ${recipient}`);
  return { success: true, result: { channel, recipient, sentAt: new Date().toISOString() } };
}

stepRegistry.register('GHL_SEND_SMS', async (ctx: ActionContext): Promise<StepExecutionResult> => {
  try {
    const message = (ctx.actionParams.message as string) || 'Message from Zenowethu Debt Counsellors.';
    return await logNotification(ctx, 'SMS', message);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
});

stepRegistry.register(
  'GHL_SEND_EMAIL',
  async (ctx: ActionContext): Promise<StepExecutionResult> => {
    try {
      const message = (ctx.actionParams.message as string) || 'Email from Zenowethu Debt Counsellors.';
      return await logNotification(ctx, 'EMAIL', message);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  },
);

stepRegistry.register(
  'GHL_SEND_WHATSAPP',
  async (ctx: ActionContext): Promise<StepExecutionResult> => {
    try {
      const message = (ctx.actionParams.message as string) || 'WhatsApp from Zenowethu Debt Counsellors.';
      return await logNotification(ctx, 'WHATSAPP', message);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  },
);

stepRegistry.register(
  'GHL_WAIT_DOCUMENT',
  async (ctx: ActionContext): Promise<StepExecutionResult> => {
    try {
      const documentType = (ctx.actionParams.documentType as string) || 'document';
      logger.info(`[GHL_WAIT_DOCUMENT] Case ${ctx.caseId}: waiting for ${documentType}`);
      return {
        success: true,
        requiresUserAction: true,
        userActionPrompt: `Waiting for client to upload: ${documentType}. This step will auto-complete when the document is received.`,
        result: { waitingFor: documentType, waitStartedAt: new Date().toISOString() },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  },
);

stepRegistry.register(
  'GHL_WAIT_REPLY',
  async (ctx: ActionContext): Promise<StepExecutionResult> => {
    try {
      const replyContext = (ctx.actionParams.context as string) || 'client reply';
      logger.info(`[GHL_WAIT_REPLY] Case ${ctx.caseId}: waiting for ${replyContext}`);
      return {
        success: true,
        requiresUserAction: true,
        userActionPrompt: `Waiting for reply: ${replyContext}. This step will auto-complete when a reply is received.`,
        result: { waitingFor: replyContext, waitStartedAt: new Date().toISOString() },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  },
);
