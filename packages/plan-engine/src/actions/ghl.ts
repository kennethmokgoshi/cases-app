import { GhlService } from '@zenowethu/shared-lib';
import { logger } from '@zenowethu/shared-lib';
import { stepRegistry } from '../step-registry';
import type { ActionContext } from '../step-registry';
import type { StepExecutionResult } from '../types';

stepRegistry.register('GHL_SEND_SMS', async (ctx: ActionContext): Promise<StepExecutionResult> => {
  try {
    const message = (ctx.actionParams.message as string) || 'Message from Zenowethu Debt Counsellors.';
    const result = await GhlService.sendMessage(ctx.caseId, 'SMS', message);

    if (!result.success) {
      logger.warn(`[GHL_SEND_SMS] Case ${ctx.caseId}: send failed — ${result.error}`);
      return { success: false, error: result.error };
    }

    logger.info(`[GHL_SEND_SMS] Case ${ctx.caseId}: SMS sent to ${result.recipient} (msgId=${result.messageId})`);
    return {
      success: true,
      result: { channel: 'SMS', recipient: result.recipient, messageId: result.messageId, sentAt: new Date().toISOString() },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
});

stepRegistry.register('GHL_SEND_EMAIL', async (ctx: ActionContext): Promise<StepExecutionResult> => {
  try {
    const message = (ctx.actionParams.message as string) || 'Email from Zenowethu Debt Counsellors.';
    const subject = (ctx.actionParams.subject as string) || 'Update from Zenowethu Debt Counsellors';
    const result = await GhlService.sendMessage(ctx.caseId, 'EMAIL', message, subject);

    if (!result.success) {
      logger.warn(`[GHL_SEND_EMAIL] Case ${ctx.caseId}: send failed — ${result.error}`);
      return { success: false, error: result.error };
    }

    logger.info(`[GHL_SEND_EMAIL] Case ${ctx.caseId}: email sent to ${result.recipient} (msgId=${result.messageId})`);
    return {
      success: true,
      result: { channel: 'EMAIL', recipient: result.recipient, messageId: result.messageId, sentAt: new Date().toISOString() },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
});

stepRegistry.register('GHL_SEND_WHATSAPP', async (ctx: ActionContext): Promise<StepExecutionResult> => {
  try {
    const message = (ctx.actionParams.message as string) || 'WhatsApp from Zenowethu Debt Counsellors.';
    const result = await GhlService.sendMessage(ctx.caseId, 'WHATSAPP', message);

    if (!result.success) {
      logger.warn(`[GHL_SEND_WHATSAPP] Case ${ctx.caseId}: send failed — ${result.error}`);
      return { success: false, error: result.error };
    }

    logger.info(`[GHL_SEND_WHATSAPP] Case ${ctx.caseId}: WhatsApp sent to ${result.recipient} (msgId=${result.messageId})`);
    return {
      success: true,
      result: { channel: 'WHATSAPP', recipient: result.recipient, messageId: result.messageId, sentAt: new Date().toISOString() },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
});

stepRegistry.register('GHL_WAIT_DOCUMENT', async (ctx: ActionContext): Promise<StepExecutionResult> => {
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
});

stepRegistry.register('GHL_WAIT_REPLY', async (ctx: ActionContext): Promise<StepExecutionResult> => {
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
});
